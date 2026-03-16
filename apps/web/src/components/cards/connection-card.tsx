import { Link } from "@tanstack/react-router";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { ArrowLeftRight, FileText } from "lucide-react";
import Markdown from "react-markdown";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnectionSources } from "@/hooks/use-connection-sources";
import { cn } from "@/lib/utils";

import { CardShell } from "./card-shell";
import type { ConnectionTypeData, PostCardData } from "./types";

interface ConnectionCardProps {
  post: PostCardData & { typeData: ConnectionTypeData };
}

export function ConnectionCard({ post }: ConnectionCardProps) {
  const { sourceATitleHint, sourceBTitleHint, connectionType, sourceAKeyIdea, sourceBKeyIdea } =
    post.typeData;

  const { sourceA, sourceB, isLoading, isError } = useConnectionSources({
    postId: post._id,
    primarySourceDocumentId: post.primarySourceDocumentId,
  });

  // Legacy posts may not have connectionType; default to cross-document
  const isWithinDocument = connectionType === "within_document";
  const showSourceDetails = !isError;

  return (
    <CardShell post={post} accentClassName="via-violet-500/30 group-hover/card:via-violet-500/60">
      <div className="mb-3 flex items-center gap-2" data-testid="connection-header">
        <Badge
          variant="outline"
          className="gap-1.5 border-violet-500/15 bg-violet-500/[0.03] font-normal text-muted-foreground"
        >
          <ArrowLeftRight className="size-3 shrink-0 text-violet-500/60" />
          {isWithinDocument ? "Cross-section" : "Cross-source"}
        </Badge>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="connection-sources">
        <SourcePanel
          source={{
            titleHint: sourceATitleHint,
            documentId: sourceA?.documentId ?? post.primarySourceDocumentId,
            keyIdea: sourceAKeyIdea ?? null,
            chunkContent: showSourceDetails ? (sourceA?.chunkContent ?? null) : null,
          }}
          side="a"
          isLoading={showSourceDetails && isLoading}
        />
        <SourcePanel
          source={{
            titleHint: sourceBTitleHint,
            documentId: sourceB?.documentId ?? null,
            keyIdea: sourceBKeyIdea ?? null,
            chunkContent: showSourceDetails ? (sourceB?.chunkContent ?? null) : null,
          }}
          side="b"
          isLoading={showSourceDetails && isLoading}
        />
      </div>

      <BridgeIndicator />

      <div
        data-testid="connection-content"
        className="prose prose-sm prose-neutral dark:prose-invert mt-3 max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      >
        <Markdown>{post.content}</Markdown>
      </div>
    </CardShell>
  );
}

interface SourcePanelProps {
  source: {
    titleHint: string;
    documentId: Id<"documents"> | null;
    keyIdea: string | null;
    chunkContent: string | null;
  };
  side: "a" | "b";
  isLoading: boolean;
}

function SourcePanel({ source, side, isLoading }: SourcePanelProps) {
  const { titleHint, documentId, keyIdea, chunkContent } = source;
  const displayText = keyIdea ?? chunkContent;

  return (
    <div
      data-testid={`connection-source-${side}`}
      className={cn(
        "rounded-lg border p-3",
        side === "a"
          ? "border-violet-500/15 bg-violet-500/[0.03]"
          : "border-violet-400/15 bg-violet-400/[0.03]",
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <FileText className="size-3 shrink-0 text-violet-500/50" />
        {documentId ? (
          <Link
            to="/library/$documentId"
            params={{ documentId }}
            data-testid={`connection-source-${side}-link`}
            className="truncate text-xs font-medium text-foreground/80 transition-colors hover:text-violet-600 dark:hover:text-violet-400"
          >
            {titleHint}
          </Link>
        ) : (
          <span className="truncate text-xs font-medium text-foreground/80">{titleHint}</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ) : displayText ? (
        <p
          className={cn(
            "line-clamp-3 text-xs leading-relaxed text-muted-foreground",
            keyIdea && "italic",
          )}
        >
          {displayText}
        </p>
      ) : (
        <p className="text-xs italic text-muted-foreground/50">Source content unavailable</p>
      )}
    </div>
  );
}

function BridgeIndicator() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true" data-testid="connection-bridge">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-500/25 to-violet-500/40" />
      <div className="flex size-6 items-center justify-center rounded-full bg-violet-500/10 ring-1 ring-violet-500/20">
        <ArrowLeftRight className="size-3 text-violet-500/70" />
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-violet-500/25 to-violet-500/40" />
    </div>
  );
}
