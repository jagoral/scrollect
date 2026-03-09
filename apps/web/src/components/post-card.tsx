"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Bookmark, BookmarkCheck, FileText, Maximize2, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Markdown from "react-markdown";

import { ChunkContextSheetContent } from "@/components/chunk-context-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface PostCardData {
  _id: Id<"posts">;
  content: string;
  sourceDocumentTitle: string | null;
  createdAt: number;
  reaction?: "like" | "dislike" | null;
  isBookmarked?: boolean;
  sourceChunkId?: Id<"chunks">;
  sourceDocumentId?: Id<"documents">;
  sectionTitle?: string | null;
  pageNumber?: number | null;
  chunkIndex?: number;
}

interface PostCardProps {
  post: PostCardData;
}

/**
 * Update a post across all cached paginated pages of the feed query.
 * Uses getAllQueries to find every loaded page, then patches the matching post.
 */
function updatePostInPaginatedPages(
  localStore: OptimisticLocalStore,
  postId: Id<"posts">,
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

/**
 * Build a human-readable source location label from the post metadata.
 */
function getSourceLabel(post: PostCardData): string {
  const title = post.sourceDocumentTitle ?? "Untitled";
  if (post.sectionTitle) return `${title} · ${post.sectionTitle}`;
  if (post.pageNumber != null) return `${title} · Page ~${post.pageNumber}`;
  return title;
}

export function PostCard({ post }: PostCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const hasSourceDetails = post.sourceDocumentId != null && post.chunkIndex != null;

  const sourceBadge = post.sourceDocumentTitle && (
    <div className="mb-3">
      {hasSourceDetails ? (
        <Link
          href={`/library/${post.sourceDocumentId}?chunk=${post.chunkIndex}`}
          data-testid="source-badge"
        >
          <Badge
            variant="secondary"
            className="gap-1.5 font-normal hover:bg-secondary/80 transition-colors"
          >
            <FileText className="size-3 opacity-60" />
            <span className="max-w-48 truncate">{getSourceLabel(post)}</span>
          </Badge>
        </Link>
      ) : (
        <Badge variant="secondary" className="gap-1.5 font-normal" data-testid="source-badge">
          <FileText className="size-3 opacity-60" />
          <span className="max-w-48 truncate">{getSourceLabel(post)}</span>
        </Badge>
      )}
    </div>
  );

  return (
    <>
      <article
        data-testid="post-card"
        className="group/card relative overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/[0.06] transition-all duration-300 hover:ring-foreground/[0.12] hover:shadow-md"
      >
        {/* Top accent gradient */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <div className="px-5 pt-5 pb-4">
          {/* Source badge */}
          {sourceBadge}

          {/* Content */}
          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <Markdown>{post.content}</Markdown>
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3">
            <time className="text-xs tracking-wide text-muted-foreground/70">
              {formatDistanceToNow(post.createdAt, { addSuffix: true })}
            </time>

            <div className="flex items-center gap-0.5">
              {hasSourceDetails && post.sourceChunkId && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="transition-colors duration-200"
                  onClick={() => setSheetOpen(true)}
                  data-testid="expand-button"
                  title="View source context"
                >
                  <Maximize2 className="size-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "transition-colors duration-200",
                  post.isBookmarked &&
                    "bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/20 dark:hover:bg-primary/25",
                )}
                onClick={() => toggleBookmark({ postId: post._id })}
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
                  "transition-colors duration-200",
                  post.reaction === "like" &&
                    "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/25",
                )}
                onClick={() =>
                  setReaction({
                    postId: post._id,
                    reaction: post.reaction === "like" ? "none" : "like",
                  })
                }
                data-testid="like-button"
                aria-pressed={post.reaction === "like"}
                title="Like"
              >
                <ThumbsUp className={cn("size-3.5", post.reaction === "like" && "fill-current")} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "transition-colors duration-200",
                  post.reaction === "dislike" &&
                    "bg-red-500/10 text-red-500 hover:bg-red-500/15 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/25",
                )}
                onClick={() =>
                  setReaction({
                    postId: post._id,
                    reaction: post.reaction === "dislike" ? "none" : "dislike",
                  })
                }
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

      {/* Source context sheet */}
      {hasSourceDetails && post.sourceChunkId && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>Source Context</SheetTitle>
              <SheetDescription>
                View the original source chunk with surrounding context.
              </SheetDescription>
            </SheetHeader>
            <ChunkContextSheetContent
              sourceChunkId={post.sourceChunkId}
              sourceDocumentTitle={post.sourceDocumentTitle}
              sectionTitle={post.sectionTitle ?? null}
              pageNumber={post.pageNumber ?? null}
              chunkIndex={post.chunkIndex!}
              isOpen={sheetOpen}
            />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
