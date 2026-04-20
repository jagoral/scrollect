import { api } from "@scrollect/backend/convex/_generated/api";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Bookmark, BookmarkCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  DocumentThumb,
  FileTypeIcon,
  ReadingProgress,
} from "@/components/documents/document-thumb";
import { TagList } from "@/components/tags";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { usePostImpression } from "@/hooks/use-post-impression";
import { useDetailPanel } from "@/components/detail-panel";

import { DislikeReasonSheet } from "./dislike-reason-sheet";
import type { DislikeReason, PostType, PostView } from "./types";

type AccentTokens = { rail: string; text: string };

const postAccent: Record<PostType, AccentTokens> = {
  insight: { rail: "bg-primary/60", text: "text-primary" },
  quote: { rail: "bg-amber-500/60", text: "text-amber-600 dark:text-amber-400" },
  summary: { rail: "bg-blue-500/60", text: "text-blue-600 dark:text-blue-400" },
  connection: { rail: "bg-violet-500/60", text: "text-violet-600 dark:text-violet-400" },
  quiz: { rail: "bg-emerald-500/60", text: "text-emerald-600 dark:text-emerald-400" },
};

const postTypeLabel: Record<PostType, string> = {
  insight: "Insight",
  quote: "Quote",
  summary: "Summary",
  connection: "Connection",
  quiz: "Quiz",
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

interface PostShellProps {
  post: PostView;
  children: ReactNode;
  quizVariant?: "multiple_choice" | "true_false";
  onViewed?: (postId: string) => void;
}

export function PostShell({ post, children, quizVariant, onViewed }: PostShellProps) {
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
  const impressionRef = usePostImpression(post._id, impressionProperties, {
    onViewed: () => onViewed?.(post._id),
  });

  const tags = post.tags ?? [];
  const accent = postAccent[post.postType];
  const selected = detailPanel?.selectedPost?._id === post._id;

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
        data-post-id={post._id}
        data-post-type={post.postType}
        data-quiz-variant={quizVariant}
        className={cn(
          "group/card relative grid min-w-0 scroll-mt-24 grid-cols-[38px_1fr] gap-5 border-b border-border bg-card pt-6 pr-6 pb-5 pl-5 text-card-foreground transition-colors",
          detailPanel && "cursor-pointer",
          detailPanel && !selected && "hover:bg-accent/30",
          selected && "bg-primary/[0.04]",
        )}
        onClick={() => detailPanel?.openDetail(post)}
      >
        <div aria-hidden className={cn("absolute inset-x-0 top-0 h-px", accent.rail)} />

        <aside className="flex flex-col items-center gap-2 pt-[2px]">
          <DocumentThumb
            documentId={post.primarySourceDocumentId as unknown as string}
            title={post.primarySourceDocumentTitle ?? "Untitled"}
            fileType={post.fileType}
            variant="spine"
          />
          <div className="h-full w-px bg-border" />
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={cn("font-medium", accent.text)}>{postTypeLabel[post.postType]}</span>
              {quizVariant && (
                <>
                  <span className="text-foreground/30">·</span>
                  <span>{quizVariant === "multiple_choice" ? "MC" : "True/False"}</span>
                </>
              )}
              {post.isNew && (
                <>
                  <span className="text-foreground/30">·</span>
                  <span
                    data-testid="new-badge"
                    aria-label="New: from a recently added document"
                    className="inline-flex items-center gap-1.5 border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400"
                  >
                    <span aria-hidden className="size-1 rounded-full bg-emerald-500" />
                    New
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 whitespace-nowrap text-muted-foreground/80">
              {post.sectionTitle && <span className="truncate">&sect; {post.sectionTitle}</span>}
              <ReadingProgress pageStart={post.pageStart} />
            </div>
          </div>

          {children}

          {tags.length > 0 && (
            <div className="mt-4">
              <TagList tags={tags} maxVisible={3} size="sm" />
            </div>
          )}

          <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-6 border-t border-border pt-3">
            <div className="flex min-w-0 items-center gap-2 text-[12px] leading-snug text-muted-foreground">
              <FileTypeIcon fileType={post.fileType} className="text-muted-foreground/70" />
              <span data-testid="source-badge" className="min-w-0 truncate">
                <span className="border-b border-border font-logo text-[13.5px] font-medium text-foreground/85">
                  {post.primarySourceDocumentTitle ?? "Untitled"}
                </span>
              </span>
              <span className="text-foreground/30">·</span>
              <time className="font-mono text-[11px] tracking-wide text-muted-foreground/60">
                {formatDistanceToNow(post.createdAt, { addSuffix: true })}
              </time>
            </div>

            <div className="flex items-center gap-0" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8 rounded-none transition-all duration-200 active:scale-95",
                  post.isBookmarked
                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                onClick={() => {
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
                  <BookmarkCheck className="size-[15px]" />
                ) : (
                  <Bookmark className="size-[15px]" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8 rounded-none transition-all duration-200 active:scale-95",
                  post.reaction === "like"
                    ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                onClick={handleLikeClick}
                data-testid="like-button"
                aria-pressed={post.reaction === "like"}
                title="Like"
              >
                <ThumbsUp
                  className={cn("size-[15px]", post.reaction === "like" && "fill-current")}
                />
              </Button>
              <Button
                ref={dislikeButtonRef}
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8 rounded-none transition-all duration-200 active:scale-95",
                  post.reaction === "dislike"
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/15"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                onClick={handleDislikeClick}
                data-testid="dislike-button"
                aria-pressed={post.reaction === "dislike"}
                title="Dislike"
              >
                <ThumbsDown
                  className={cn("size-[15px]", post.reaction === "dislike" && "fill-current")}
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
