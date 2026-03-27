import { Link } from "@tanstack/react-router";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Bookmark, BookmarkCheck, FileText, ThumbsDown, ThumbsUp } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { TagList } from "@/components/tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useCardImpression } from "@/hooks/use-card-impression";

import { DislikeReasonSheet } from "./dislike-reason-sheet";
import type { DislikeReason, PostCardData } from "./types";
import { formatAttribution } from "./utils";

function updatePostInPaginatedPages(
  localStore: OptimisticLocalStore,
  postId: PostCardData["_id"],
  updater: (post: Record<string, unknown>) => Record<string, unknown>,
) {
  const allPages = localStore.getAllQueries(api.feed.queries.list);
  for (const { args, value } of allPages) {
    if (value === undefined) continue;
    const hasMatch = value.page.some((p) => p._id === postId);
    if (!hasMatch) continue;
    localStore.setQuery(api.feed.queries.list, args, {
      ...value,
      page: value.page.map((p) => (p._id === postId ? { ...p, ...updater(p) } : p)),
    });
  }
}

function getSourceLabel(post: PostCardData): string {
  return formatAttribution({
    title: post.primarySourceDocumentTitle ?? "Untitled",
    fileType: post.fileType,
    sectionTitle: post.sectionTitle,
    pageStart: post.pageStart,
    pageEnd: post.pageEnd,
  });
}

export function SourceBadge({ post, className }: { post: PostCardData; className?: string }) {
  const posthog = usePostHog();

  return (
    <div className={cn("mb-3", className)}>
      <Link
        to="/app/library/$documentId"
        params={{ documentId: post.primarySourceDocumentId }}
        data-testid="source-badge"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-foreground/80 hover:decoration-muted-foreground/60"
        onClick={() => {
          posthog.capture("source.revisited", {
            card_type: post.postType,
          });
        }}
      >
        <FileText className="size-3 shrink-0" />
        <span>{getSourceLabel(post)}</span>
      </Link>
    </div>
  );
}

interface CardShellProps {
  post: PostCardData;
  children: ReactNode;
  accentClassName?: string;
  quizVariant?: "multiple_choice" | "true_false";
}

export function CardShell({ post, children, accentClassName, quizVariant }: CardShellProps) {
  const posthog = usePostHog();
  const [sheetOpen, setSheetOpen] = useState(false);
  const reasonSelectedRef = useRef(false);
  const dislikeButtonRef = useRef<HTMLButtonElement>(null);

  const impressionProperties = useMemo(
    () => ({
      card_type: post.postType,
      source_type: "document",
      created_at: post.createdAt,
    }),
    [post.postType, post.createdAt],
  );
  const impressionRef = useCardImpression(post._id, impressionProperties);

  const tags = post.tags ?? [];

  const toggleBookmark = useMutation(api.bookmarks.toggle).withOptimisticUpdate(
    (localStore, args) => {
      updatePostInPaginatedPages(localStore, args.postId, (p) => ({
        isBookmarked: !p.isBookmarked,
      }));
    },
  );

  const setReaction = useMutation(api.feed.queries.setReaction).withOptimisticUpdate(
    (localStore, args) => {
      updatePostInPaginatedPages(localStore, args.postId, () => ({
        reaction: args.reaction === "none" ? undefined : args.reaction,
      }));
    },
  );

  const isLegacyPost = !post.cardDraftId;

  const handleLikeClick = useCallback(() => {
    const nextReaction = post.reaction === "like" ? "none" : "like";
    posthog.capture("card.reacted", {
      card_type: post.postType,
      reaction: nextReaction,
    });
    setReaction({ postId: post._id, reaction: nextReaction });
  }, [post.reaction, post.postType, post._id, posthog, setReaction]);

  const handleDislikeClick = useCallback(() => {
    if (post.reaction === "dislike") {
      posthog.capture("card.reacted", {
        card_type: post.postType,
        reaction: "none",
      });
      setReaction({ postId: post._id, reaction: "none" });
      return;
    }

    reasonSelectedRef.current = false;
    setSheetOpen(true);
    posthog.capture("card.dislike_reason_sheet_opened", {
      card_type: post.postType,
    });
  }, [post.reaction, post.postType, post._id, posthog, setReaction]);

  const handleReasonSelected = useCallback(
    (reason: DislikeReason) => {
      reasonSelectedRef.current = true;

      posthog.capture("card.reacted", {
        card_type: post.postType,
        reaction: "dislike",
        dislike_reason: reason,
      });
      posthog.capture("card.dislike_reason_selected", {
        card_type: post.postType,
        dislike_reason: reason,
        source_document_id: post.primarySourceDocumentId,
        card_draft_id: post.cardDraftId ?? null,
      });

      setReaction({
        postId: post._id,
        reaction: "dislike",
        dislikeReason: reason,
      });

      if (isLegacyPost) {
        toast.info("Feedback saved, but won't affect future cards for this older post.");
      }
    },
    [
      post.postType,
      post.primarySourceDocumentId,
      post.cardDraftId,
      post._id,
      posthog,
      setReaction,
      isLegacyPost,
    ],
  );

  const handleSheetDismissed = useCallback(() => {
    posthog.capture("card.dislike_reason_sheet_dismissed", {
      card_type: post.postType,
      selected: reasonSelectedRef.current,
    });
  }, [posthog, post.postType]);

  return (
    <>
      <article
        ref={impressionRef}
        data-testid="post-card"
        data-card-type={post.postType}
        data-quiz-variant={quizVariant}
        className="group/card relative overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/[0.06] transition-all duration-300 hover:-translate-y-0.5 hover:ring-primary/15 hover:shadow-lg hover:shadow-primary/[0.06]"
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent transition-all duration-300 group-hover/card:h-0.5 group-hover/card:via-primary/60",
            accentClassName,
          )}
        />

        <div className="px-5 pt-5 pb-4">
          {post.isNew && (
            <Badge
              data-testid="new-badge"
              aria-label="New: from a recently added document"
              className="mb-2 gap-1"
              variant="freshness"
            >
              <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-emerald-500" />
              New
            </Badge>
          )}
          {children}

          {tags.length > 0 && (
            <div className="mt-2">
              <TagList tags={tags} maxVisible={3} size="sm" />
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3">
            <time className="text-xs tracking-wide text-muted-foreground/70">
              {formatDistanceToNow(post.createdAt, { addSuffix: true })}
            </time>

            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "transition-all duration-200 active:scale-90",
                  post.isBookmarked &&
                    "bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/20 dark:hover:bg-primary/25",
                )}
                onClick={() => {
                  posthog.capture("card.bookmarked", {
                    card_type: post.postType,
                    bookmarked: !post.isBookmarked,
                  });
                  toggleBookmark({ postId: post._id });
                }}
                data-testid="save-button"
                aria-pressed={!!post.isBookmarked}
                title="Save"
              >
                {post.isBookmarked ? (
                  <BookmarkCheck className="size-3.5" />
                ) : (
                  <Bookmark className="size-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "transition-all duration-200 active:scale-90",
                  post.reaction === "like" &&
                    "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/25",
                )}
                onClick={handleLikeClick}
                data-testid="like-button"
                aria-pressed={post.reaction === "like"}
                title="Like"
              >
                <ThumbsUp className={cn("size-3.5", post.reaction === "like" && "fill-current")} />
              </Button>
              <Button
                ref={dislikeButtonRef}
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "transition-all duration-200 active:scale-90",
                  post.reaction === "dislike" &&
                    "bg-red-500/10 text-red-500 hover:bg-red-500/15 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/25",
                )}
                onClick={handleDislikeClick}
                data-testid="dislike-button"
                aria-pressed={post.reaction === "dislike"}
                title="Dislike"
              >
                <ThumbsDown
                  className={cn("size-3.5", post.reaction === "dislike" && "fill-current")}
                />
              </Button>
            </div>
          </div>
        </div>
      </article>

      <DislikeReasonSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onReasonSelected={handleReasonSelected}
        onDismissed={handleSheetDismissed}
        anchorRef={dislikeButtonRef}
      />
    </>
  );
}
