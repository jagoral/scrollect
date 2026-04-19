import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { BookOpen, ExternalLink, Loader2, MapPin } from "lucide-react";
import { usePostHog } from "posthog-js/react";

import { Badge } from "@/components/ui/badge";

import { getFileTypeConfig } from "./file-type-config";

function FileTypeBadge({ fileType }: { fileType?: string }) {
  const { Icon, label } = getFileTypeConfig(fileType);

  return (
    <Badge
      variant="outline"
      className="gap-1.5 rounded-none border-border bg-transparent font-normal text-muted-foreground"
    >
      <Icon className="size-4" />
      {label}
    </Badge>
  );
}

function formatPageRange(pageStart?: number, pageEnd?: number): string | null {
  if (pageStart == null) return null;
  if (pageEnd != null && pageEnd !== pageStart) return `Pages ${pageStart}-${pageEnd}`;
  return `Page ${pageStart}`;
}

export function SourceDetailsContent({
  postId,
  documentId,
}: {
  postId: Id<"posts">;
  documentId: Id<"documents">;
}) {
  const posthog = usePostHog();
  const { data: details, isPending } = useQuery(
    convexQuery(api.posts.getSourceDetails, { postId }),
  );

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <p className="text-sm text-muted-foreground">Source details unavailable.</p>
      </div>
    );
  }

  const pageRange = formatPageRange(details.pageStart, details.pageEnd);

  return (
    <div className="flex min-w-0 flex-col gap-4 py-2">
      <div className="flex min-w-0 flex-col gap-2">
        <FileTypeBadge fileType={details.fileType} />
        <p className="break-words text-base font-medium leading-snug text-foreground">
          {details.documentTitle}
        </p>
      </div>

      {(details.sectionTitle || pageRange) && (
        <div className="flex flex-col gap-1">
          {details.sectionTitle && details.sectionTitle !== "(ungrouped)" && (
            <div className="flex items-start gap-2 text-sm text-foreground/80">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 break-words">{details.sectionTitle}</span>
            </div>
          )}
          {pageRange && <p className="pl-[22px] text-sm text-muted-foreground">{pageRange}</p>}
        </div>
      )}

      {details.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {details.tags.map((tag) => (
            <Badge key={tag._id} variant="secondary" className="text-xs font-normal">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      {details.learningGoal && (
        <div className="border border-border p-3">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Learning goal applied
          </p>
          <p className="text-sm leading-relaxed text-foreground/80">{details.learningGoal}</p>
        </div>
      )}

      {details.sectionSummary && (
        <div className="border border-border p-3">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Section context
          </p>
          <p className="text-sm leading-relaxed text-foreground/80">{details.sectionSummary}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {details.sourceUrl && (
          <a
            href={details.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            onClick={() => posthog.capture("source.original_opened", { postId })}
          >
            <ExternalLink className="size-3.5" />
            Open original
          </a>
        )}
        <Link
          to="/app/library/$documentId"
          params={{ documentId }}
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          onClick={() => posthog.capture("source.library_navigated", { postId })}
        >
          <BookOpen className="size-3.5" />
          View in Library
        </Link>
      </div>
    </div>
  );
}
