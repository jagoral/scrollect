import type { Doc } from "@scrollect/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { BookOpen, FileUp, Library, Loader2, Rss, Sparkles, Timer } from "lucide-react";

import { StatusBadge } from "@/components/document-status";
import { Button } from "@/components/ui/button";

type FeedEmptyReason = "no_drafts" | "processing" | null;

interface FeedEmptyStateProps {
  reason: FeedEmptyReason;
  onServe: () => void;
  serving: boolean;
}

export function FeedEmptyState({ reason, onServe, serving }: FeedEmptyStateProps) {
  if (reason === "processing") {
    return (
      <div
        data-testid="feed-processing-state"
        className="mt-12 flex flex-col items-center gap-5 text-center"
      >
        <div className="relative flex size-16 items-center justify-center border border-amber-500/30 bg-transparent">
          <Timer className="size-8 text-amber-600/70 dark:text-amber-400/70" />
          <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center border border-border bg-card">
            <Loader2 className="size-3 animate-spin text-amber-600 dark:text-amber-400" />
          </span>
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight">Your documents are being processed</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Learning posts will appear here once processing completes. This usually takes a few
            minutes.
          </p>
        </div>
        <p className="text-xs text-muted-foreground/60">
          Processing continues in the background - you can close the app and come back later.
        </p>
      </div>
    );
  }

  if (reason === "no_drafts") {
    return (
      <div
        data-testid="feed-empty-state"
        className="mt-12 flex flex-col items-center gap-5 text-center"
      >
        <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
          <FileUp className="size-8 text-primary/70" />
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight">No content yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Upload books, articles, or videos to your library. We&apos;ll generate bite-sized
            learning posts from them automatically.
          </p>
        </div>
        <Button render={<Link to="/app/upload" />} data-testid="feed-upload-cta">
          <FileUp className="size-4" data-icon="inline-start" />
          Upload your first content
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="feed-empty-state"
      className="mt-12 flex flex-col items-center gap-5 text-center"
    >
      <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
        <Rss className="size-8 text-primary/70" />
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight">No posts yet</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Click &quot;Generate&quot; to create learning posts from your documents.
        </p>
      </div>
      <Button onClick={onServe} disabled={serving} data-testid="feed-serve-button">
        <Sparkles className="size-4" data-icon="inline-start" />
        Generate your first feed
      </Button>
    </div>
  );
}

interface DocumentFeedEmptyStateProps {
  document: Doc<"documents"> | null | undefined;
  reason: FeedEmptyReason;
}

export function DocumentFeedEmptyState({ document, reason }: DocumentFeedEmptyStateProps) {
  const status = document?.status;
  const waitingForProcessing =
    reason === "processing" ||
    status === "uploaded" ||
    status === "parsing" ||
    status === "chunking" ||
    status === "embedding" ||
    status === "summarizing" ||
    status === "generating_cards";

  return (
    <div
      data-testid="feed-document-empty-state"
      className="mt-12 flex flex-col items-center gap-5 px-4 text-center"
    >
      <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
        {waitingForProcessing ? (
          <Loader2 className="size-8 animate-spin text-primary/70" />
        ) : (
          <BookOpen className="size-8 text-primary/70" />
        )}
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight">
          {waitingForProcessing ? "No posts yet - still generating" : "No posts for this document"}
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {waitingForProcessing
            ? "Scrollect is still turning this document into learning posts."
            : "There are no ready posts for this document yet."}
        </p>
      </div>
      {document && (
        <div className="flex flex-col items-center gap-2">
          <p className="max-w-sm break-words text-xs text-muted-foreground">{document.title}</p>
          <StatusBadge status={document.status} />
        </div>
      )}
    </div>
  );
}

interface TopicFeedEmptyStateProps {
  topicName: string | undefined;
  reason: FeedEmptyReason;
}

export function TopicFeedEmptyState({ topicName, reason }: TopicFeedEmptyStateProps) {
  const waitingForProcessing = reason === "processing";

  return (
    <div
      data-testid="feed-topic-empty-state"
      className="mt-12 flex flex-col items-center gap-5 px-4 text-center"
    >
      <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
        {waitingForProcessing ? (
          <Loader2 className="size-8 animate-spin text-primary/70" />
        ) : (
          <Rss className="size-8 text-primary/70" />
        )}
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight">
          {waitingForProcessing ? "No posts yet - still generating" : "No posts for this topic"}
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {waitingForProcessing
            ? "Scrollect is still preparing posts for this topic."
            : "Assign documents to this topic from your library, then generate to populate the feed."}
        </p>
      </div>
      {topicName && (
        <p className="max-w-sm break-words text-xs text-muted-foreground">{topicName}</p>
      )}
      {!waitingForProcessing && (
        <Button render={<Link to="/app/library" />} data-testid="feed-topic-empty-library-cta">
          <Library className="size-4" data-icon="inline-start" />
          Go to library
        </Button>
      )}
    </div>
  );
}

interface UnknownScopeStateProps {
  scope: "topic" | "document";
}

export function UnknownScopeState({ scope }: UnknownScopeStateProps) {
  const isTopic = scope === "topic";
  return (
    <div
      data-testid={isTopic ? "feed-unknown-topic-state" : "feed-unknown-document-state"}
      className="mt-12 flex flex-col items-center gap-5 px-4 text-center"
    >
      <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
        {isTopic ? (
          <Rss className="size-8 text-primary/70" />
        ) : (
          <BookOpen className="size-8 text-primary/70" />
        )}
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight">
          {isTopic ? "Unknown topic" : "Unknown document"}
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {isTopic
            ? "This topic doesn't exist or you don't have access to it."
            : "This document doesn't exist or you don't have access to it."}
        </p>
      </div>
      <Button
        render={<Link to="/app/feed" />}
        variant="outline"
        data-testid="feed-unknown-scope-back"
      >
        Back to feed
      </Button>
    </div>
  );
}
