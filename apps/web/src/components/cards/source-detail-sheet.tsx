import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { BookOpen, ExternalLink, MapPin } from "lucide-react";
import type { RefObject } from "react";
import { usePostHog } from "posthog-js/react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-is-mobile";

import { getFileTypeConfig } from "./file-type-config";

function FileTypeBadge({ fileType }: { fileType?: string }) {
  const { Icon, label } = getFileTypeConfig(fileType);

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-primary/15 bg-primary/[0.03] font-normal text-muted-foreground"
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

function SourceDetailsContent({
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
      <div className="flex flex-col gap-3 px-5 py-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
        <p className="text-sm text-muted-foreground">Source details unavailable.</p>
      </div>
    );
  }

  const pageRange = formatPageRange(details.pageStart, details.pageEnd);

  return (
    <div className="flex flex-col gap-4 px-5 py-2">
      <div className="flex flex-col gap-2">
        <FileTypeBadge fileType={details.fileType} />
        <p className="text-base font-medium leading-snug text-foreground">
          {details.documentTitle}
        </p>
      </div>

      {(details.sectionTitle || pageRange) && (
        <div className="flex flex-col gap-1">
          {details.sectionTitle && details.sectionTitle !== "(ungrouped)" && (
            <div className="flex items-start gap-2 text-sm text-foreground/80">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span>{details.sectionTitle}</span>
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

      {details.sectionSummary && (
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Section context
          </p>
          <p className="text-sm leading-relaxed text-foreground/80">{details.sectionSummary}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
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

interface SourceDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: Id<"posts">;
  documentId: Id<"documents">;
  anchorRef: RefObject<HTMLButtonElement | null>;
}

export function SourceDetailSheet({
  open,
  onOpenChange,
  postId,
  documentId,
  anchorRef,
}: SourceDetailSheetProps) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverPrimitive.Backdrop className="fixed inset-0 z-40" />
        <PopoverContent
          anchor={anchorRef}
          side="bottom"
          align="start"
          sideOffset={8}
          data-testid="source-detail-sheet"
          className="w-80 gap-0 p-0 py-3"
        >
          <PopoverTitle className="sr-only">Source details</PopoverTitle>
          <PopoverDescription className="sr-only">
            Details about the source of this learning card.
          </PopoverDescription>
          <SourceDetailsContent postId={postId} documentId={documentId} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[70dvh] overflow-y-auto rounded-t-2xl px-0 pb-[env(safe-area-inset-bottom)]"
        data-testid="source-detail-sheet"
      >
        <div className="mx-auto mb-1 mt-0 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" />

        <SheetTitle className="sr-only">Source details</SheetTitle>
        <SheetDescription className="sr-only">
          Details about the source of this learning card.
        </SheetDescription>

        <SourceDetailsContent postId={postId} documentId={documentId} />
      </SheetContent>
    </Sheet>
  );
}
