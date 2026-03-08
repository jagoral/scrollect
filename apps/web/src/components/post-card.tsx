"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Bookmark, BookmarkCheck, FileText, ThumbsDown, ThumbsUp } from "lucide-react";
import Markdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface PostCardData {
  _id: Id<"posts">;
  content: string;
  sourceDocumentTitle: string | null;
  createdAt: number;
  reaction?: "like" | "dislike" | null;
  isBookmarked?: boolean;
}

interface PostCardProps {
  post: PostCardData;
}

export function PostCard({ post }: PostCardProps) {
  const toggleBookmark = useMutation(api.bookmarks.toggle);
  const setReaction = useMutation(api.feed.setReaction);

  return (
    <Card
      data-testid="post-card"
      className="overflow-hidden border-l-4 border-l-primary/40 transition-all hover:border-l-primary hover:shadow-sm"
    >
      <CardContent className="py-5">
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed">
          <Markdown>{post.content}</Markdown>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          {post.sourceDocumentTitle && (
            <>
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {post.sourceDocumentTitle}
              </span>
              <span>&middot;</span>
            </>
          )}
          <span>{formatDistanceToNow(post.createdAt, { addSuffix: true })}</span>
        </div>
        <div className="mt-3 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => toggleBookmark({ postId: post._id })}
            data-testid="save-button"
            aria-pressed={!!post.isBookmarked}
          >
            {post.isBookmarked ? (
              <BookmarkCheck className="h-4 w-4 text-primary" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              setReaction({
                postId: post._id,
                reaction: post.reaction === "like" ? "none" : "like",
              })
            }
            data-testid="like-button"
            aria-pressed={post.reaction === "like"}
          >
            {post.reaction === "like" ? (
              <ThumbsUp className="h-4 w-4 fill-current text-green-600" />
            ) : (
              <ThumbsUp className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              setReaction({
                postId: post._id,
                reaction: post.reaction === "dislike" ? "none" : "dislike",
              })
            }
            data-testid="dislike-button"
            aria-pressed={post.reaction === "dislike"}
          >
            {post.reaction === "dislike" ? (
              <ThumbsDown className="h-4 w-4 fill-current text-red-500" />
            ) : (
              <ThumbsDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
