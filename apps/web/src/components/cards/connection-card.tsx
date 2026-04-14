import { Link } from "@tanstack/react-router";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { ArrowLeftRight, FileText } from "lucide-react";
import Markdown from "react-markdown";

import { Badge } from "@/components/ui/badge";

import { CardShell } from "./card-shell";
import type { ConnectionTypeData, PostCardData } from "./types";

interface ConnectionCardProps {
  post: PostCardData & { typeData: ConnectionTypeData };
}

export function ConnectionCard({ post }: ConnectionCardProps) {
  const { sourceATitleHint, sourceBTitleHint, connectionType, sourceAKeyIdea, sourceBKeyIdea } =
    post.typeData;

  const isWithinDocument = connectionType === "within_document";

  return (
    <CardShell post={post}>
      <div className="mb-3 flex items-center gap-2" data-testid="connection-header">
        <Badge
          variant="outline"
          className="gap-1.5 rounded-none border-violet-500/30 bg-transparent font-normal text-muted-foreground"
        >
          <ArrowLeftRight className="size-3 shrink-0 text-violet-500/60" />
          {isWithinDocument ? "Cross-section" : "Cross-source"}
        </Badge>
      </div>

      <ConnectionProvenance
        sourceATitleHint={sourceATitleHint}
        sourceBTitleHint={sourceBTitleHint}
        primaryDocumentId={post.primarySourceDocumentId}
        isWithinDocument={isWithinDocument}
      />

      {(sourceAKeyIdea || sourceBKeyIdea) && (
        <div className="mb-3 flex flex-col gap-1.5">
          {sourceAKeyIdea && (
            <p
              data-testid="connection-key-idea-a"
              className="text-xs italic leading-relaxed text-muted-foreground"
            >
              {sourceAKeyIdea}
            </p>
          )}
          {sourceBKeyIdea && (
            <p
              data-testid="connection-key-idea-b"
              className="text-xs italic leading-relaxed text-muted-foreground"
            >
              {sourceBKeyIdea}
            </p>
          )}
        </div>
      )}

      <div
        data-testid="connection-content"
        className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      >
        <Markdown>{post.content}</Markdown>
      </div>
    </CardShell>
  );
}

interface ConnectionProvenanceProps {
  sourceATitleHint: string;
  sourceBTitleHint: string;
  primaryDocumentId: Id<"documents">;
  isWithinDocument: boolean;
}

function ConnectionProvenance({
  sourceATitleHint,
  sourceBTitleHint,
  primaryDocumentId,
  isWithinDocument,
}: ConnectionProvenanceProps) {
  if (isWithinDocument) {
    return (
      <div
        data-testid="connection-provenance"
        className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground/70"
      >
        <FileText className="size-3 shrink-0" />
        <span className="truncate">
          Sections in:{" "}
          <Link
            to="/app/library/$documentId"
            params={{ documentId: primaryDocumentId }}
            className="underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-foreground/80 hover:decoration-muted-foreground/60"
          >
            {sourceATitleHint}
          </Link>
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="connection-provenance"
      className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground/70"
    >
      <FileText className="size-3 shrink-0" />
      <span className="truncate">
        Connecting:{" "}
        <Link
          to="/app/library/$documentId"
          params={{ documentId: primaryDocumentId }}
          className="underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-foreground/80 hover:decoration-muted-foreground/60"
          aria-label={`Source: ${sourceATitleHint}`}
        >
          {sourceATitleHint}
        </Link>
        {" + "}
        <span>{sourceBTitleHint}</span>
      </span>
    </div>
  );
}
