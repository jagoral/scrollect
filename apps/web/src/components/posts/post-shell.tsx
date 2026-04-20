import { api } from "@scrollect/backend/convex/_generated/api";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Bookmark, BookmarkCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { TagList } from "@/components/tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { usePostImpression } from "@/hooks/use-post-impression";
import { useDetailPanel } from "@/components/detail-panel";

import { DislikeReasonSheet } from "./dislike-reason-sheet";
import { getFileTypeConfig } from "./file-type-config";
import type { DislikeReason, PostType, PostView } from "./types";

const postAccentColor: Record<PostType, string> = {
  insight: "border-l-primary",
  quote: "border-l-amber-500",
  summary: "border-l-blue-500",
  connection: "border-l-violet-500",
  quiz: "border-l-emerald-500",
};

function updatePostInPaginatedPages(
  localStore: OptimisticLocalStore,
  postId: PostView["_id"],
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

function removePostFromPaginatedPages(localStore: OptimisticLocalStore, postId: PostView["_id"]) {
  const allPages = localStore.getAllQueries(api.feed.queries.list);
  for (const { args, value } of allPages) {
    if (value === undefined) continue;
    const hasMatch = value.page.some((p) => p._id === postId);
    if (!hasMatch) continue;
    localStore.setQuery(api.feed.queries.list, args, {
      ...value,
      page: value.page.filter((p) => p._id !== postId),
    });
  }
}

export function SourceBadge({ post, className }: { post: PostView; className?: string }) {
  const { Icon } = getFileTypeConfig(post.fileType);

  return (
    <div
      data-testid="source-badge"
      className={cn(
        "mb-3 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{post.primarySourceDocumentTitle ?? "Untitled"}</span>
    </div>
  );
}

interface PostShellProps {
  post: PostView;
  children: ReactNode;
  quizVariant?: "multiple_choice" | "true_false";
}

export function PostShell({ post, children, quizVariant }: PostShellProps) {
  const posthog = usePostHog();
  const detailPanel = useDetailPanel();
  const [sheetOpen, setSheetOpen] = useState(false);
  const reasonSelectedRef = useRef(false);
  const dislikeButtonRef = useRef<HTMLButtonElement>(null);

  const impressionProperties = useMemo(
    () => ({
      post_type: post.postType,
      source_type: "document",
      created_at: post.createdAt,
    }),
    [post.postType, post.createdAt],
  );
  const impressionRef = usePostImpression(post._id, impressionProperties);

  const tags = post.tags ?? [];

  const toggleBookmark = useMutation(api.content.bookmarks.toggle).withOptimisticUpdate(
    (localStore, args) => {
      updatePostInPaginatedPages(localStore, args.postId, (p) => ({
        isBookmarked: !p.isBookmarked,
      }));
    },
  );

  const setReaction = useMutation(api.feed.queries.setReaction).withOptimisticUpdate(
    (localStore, args) => {
      if (args.reaction === "dislike") {
        removePostFromPaginatedPages(localStore, args.postId);
      } else {
        updatePostInPaginatedPages(localStore, args.postId, () => ({
          reaction: args.reaction === "none" ? undefined : args.reaction,
        }));
      }
    },
  );

  const isLegacyPost = !post.postDraftId;

  const handleLikeClick = useCallback(() => {
    const nextReaction = post.reaction === "like" ? "none" : "like";
    posthog.capture("post.reacted", {
      post_type: post.postType,
      reaction: nextReaction,
    });
    setReaction({ postId: post._id, reaction: nextReaction });
  }, [post.reaction, post.postType, post._id, posthog, setReaction]);

  const handleDislikeClick = useCallback(() => {
    reasonSelectedRef.current = false;
    setSheetOpen(true);
    posthog.capture("post.dislike_reason_sheet_opened", {
      post_type: post.postType,
    });
  }, [post.postType, posthog]);

  const handleReasonSelected = useCallback(
    (reason: DislikeReason) => {
      reasonSelectedRef.current = true;

      posthog.capture("post.reacted", {
        post_type: post.postType,
        reaction: "dislike",
        dislike_reason: reason,
      });
      posthog.capture("post.dislike_reason_selected", {
        post_type: post.postType,
        dislike_reason: reason,
        source_document_id: post.primarySourceDocumentId,
        post_draft_id: post.postDraftId ?? null,
      });
      posthog.capture("post.hidden_by_dislike", {
        post_type: post.postType,
        dislike_reason: reason,
      });

      setReaction({
        postId: post._id,
        reaction: "dislike",
        dislikeReason: reason,
      });

      if (isLegacyPost) {
        toast.info("Feedback saved, but won't affect future posts for this older post.");
      }
    },
    [
      post.postType,
      post.primarySourceDocumentId,
      post.postDraftId,
      post._id,
      posthog,
      setReaction,
      isLegacyPost,
    ],
  );

  const handleSheetDismissed = useCallback(() => {
    posthog.capture("post.dislike_reason_sheet_dismissed", {
      post_type: post.postType,
      selected: reasonSelectedRef.current,
    });
  }, [posthog, post.postType]);

  return (
    <>
      <article
        ref={impressionRef}
        data-testid="post-card"
        data-post-type={post.postType}
        data-quiz-variant={quizVariant}
        className={cn(
          "group/card relative min-w-0 border-l-2 border-t border-border first:border-t-0 bg-card text-card-foreground transition-colors border-r",
          postAccentColor[post.postType],
          detailPanel && "cursor-pointer hover:bg-accent/30",
        )}
        onClick={() => detailPanel?.openDetail(post)}
      >
        <div className="px-6 pt-6 pb-5">
          {post.isNew && (
            <Badge
              data-testid="new-badge"
              aria-label="New: from a recently added document"
              className="mb-2 gap-1 rounded-none border-emerald-500/40 bg-transparent text-emerald-600 dark:text-emerald-400"
              variant="freshness"
            >
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
              New
            </Badge>
          )}
          {children}

          {tags.length > 0 && (
            <div className="mt-2">
              <TagList tags={tags} maxVisible={3} size="sm" />
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <time className="text-xs tracking-wide text-muted-foreground/70">
              {formatDistanceToNow(post.createdAt, { addSuffix: true })}
            </time>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "transition-all duration-200 active:scale-95 [&_svg]:transition-all [&_svg]:duration-200",
                  post.isBookmarked && "bg-primary/15 text-primary hover:bg-primary/20",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  posthog.capture("post.bookmarked", {
                    post_type: post.postType,
                    bookmarked: !post.isBookmarked,
                  });
                  toggleBookmark({ postId: post._id });
                }}
                data-testid="save-button"
                aria-pressed={!!post.isBookmarked}
                title="Save"
              >
                {post.isBookmarked ? (
                  <BookmarkCheck className="size-4" />
                ) : (
                  <Bookmark className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "transition-all duration-200 active:scale-95 [&_svg]:transition-all [&_svg]:duration-200",
                  post.reaction === "like" &&
                    "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleLikeClick();
                }}
                data-testid="like-button"
                aria-pressed={post.reaction === "like"}
                title="Like"
              >
                <ThumbsUp className={cn("size-4", post.reaction === "like" && "fill-current")} />
              </Button>
              <Button
                ref={dislikeButtonRef}
                variant="ghost"
                size="icon"
                className={cn(
                  "transition-all duration-200 active:scale-95 [&_svg]:transition-all [&_svg]:duration-200",
                  post.reaction === "dislike" && "bg-red-500/15 text-red-500 hover:bg-red-500/20",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDislikeClick();
                }}
                data-testid="dislike-button"
                aria-pressed={post.reaction === "dislike"}
                title="Dislike"
              >
                <ThumbsDown
                  className={cn("size-4", post.reaction === "dislike" && "fill-current")}
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
