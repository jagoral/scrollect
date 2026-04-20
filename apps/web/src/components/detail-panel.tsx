import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "@scrollect/backend/convex/_generated/api";
import { format } from "date-fns";
import { BookOpen, ExternalLink, Loader2, MousePointerClick, X } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { createContext, useCallback, useContext, useState } from "react";
import Markdown from "react-markdown";

import {
  DetailRail,
  DetailRailPlaceholder,
  DETAIL_RULED_BG_STYLE,
  RailMarker,
} from "@/components/detail-rail";
import { DocumentThumb, FileTypeIcon } from "@/components/documents/document-thumb";
import { Post } from "@/components/posts";
import type { PostType, PostView } from "@/components/posts/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type DetailPanelContextValue = {
  selectedPost: PostView | null;
  openDetail: (post: PostView) => void;
  closeDetail: () => void;
};

const DetailPanelContext = createContext<DetailPanelContextValue | null>(null);

export function useDetailPanel() {
  return useContext(DetailPanelContext);
}

export function DetailPanelProvider({ children }: { children: React.ReactNode }) {
  const [selectedPost, setSelectedPost] = useState<PostView | null>(null);

  const openDetail = useCallback((post: PostView) => {
    setSelectedPost(post);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedPost(null);
  }, []);

  return (
    <DetailPanelContext.Provider value={{ selectedPost, openDetail, closeDetail }}>
      {children}
    </DetailPanelContext.Provider>
  );
}

export function DetailPanel() {
  const ctx = useDetailPanel();
  const isMobile = useIsMobile();
  if (!ctx) return null;
  const { selectedPost, closeDetail } = ctx;

  if (!selectedPost) {
    return (
      <DetailRail testId="feed-detail-panel">
        <DetailRailPlaceholder
          icon={MousePointerClick}
          title="Select a post"
          description="Click any post in your feed to see its source and context here."
        />
      </DetailRail>
    );
  }

  if (isMobile) {
    return (
      <Sheet open onOpenChange={closeDetail}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-0 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto mt-0 mb-1 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
          <SheetTitle className="sr-only">Post details</SheetTitle>
          <SheetDescription className="sr-only">Expanded view of learning post.</SheetDescription>
          <div key={selectedPost._id} className="animate-in fade-in duration-200">
            <DetailPanelContent post={selectedPost} onClose={closeDetail} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DetailRail testId="feed-detail-panel">
      <div className="h-full overflow-y-auto overscroll-contain">
        <div key={selectedPost._id} className="animate-in fade-in slide-in-from-top-2 duration-200">
          <DetailPanelContent post={selectedPost} onClose={closeDetail} />
        </div>
      </div>
    </DetailRail>
  );
}

const postTypeLabel: Record<PostType, string> = {
  insight: "Insight",
  quote: "Quote",
  summary: "Summary",
  connection: "Connection",
  quiz: "Quiz",
};

const postTypeText: Record<PostType, string> = {
  insight: "text-primary",
  quote: "text-amber-600 dark:text-amber-400",
  summary: "text-blue-600 dark:text-blue-400",
  connection: "text-violet-600 dark:text-violet-400",
  quiz: "text-emerald-600 dark:text-emerald-400",
};

function DetailPanelContent({ post, onClose }: { post: PostView; onClose: () => void }) {
  const hasQuizContent = post.typeData.type === "quiz";
  const hasMarkdownBody = !hasQuizContent && post.content.trim().length > 0;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center justify-between border-b border-dashed border-border px-6 py-4 md:px-7">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>Entry</span>
          <span className="text-foreground/30">&middot;</span>
          <span className={cn("font-medium", postTypeText[post.postType])}>
            {postTypeLabel[post.postType]}
          </span>
          <span className="text-foreground/30">&middot;</span>
          <span className="truncate">{format(post.createdAt, "MMM d, yyyy").toUpperCase()}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-none"
          onClick={onClose}
        >
          <X className="size-3.5" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <div
        className="flex flex-1 flex-col gap-8 overflow-y-auto px-6 py-7 md:px-8"
        style={DETAIL_RULED_BG_STYLE}
      >
        {hasQuizContent ? (
          <div className="-mx-6 md:-mx-8 [&_article]:border-b-0">
            <Post post={post} />
          </div>
        ) : hasMarkdownBody ? (
          <div className="prose prose-sm prose-neutral max-w-none font-logo text-[17px] leading-[1.65] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 dark:prose-invert">
            <Markdown>{post.content}</Markdown>
          </div>
        ) : null}

        <SourceMarker post={post} />
      </div>
    </div>
  );
}

function SourceMarker({ post }: { post: PostView }) {
  const posthog = usePostHog();
  const { data: details, isPending } = useQuery(
    convexQuery(api.feed.posts.getSourceDetails, { postId: post._id }),
  );

  return (
    <>
      <RailMarker marker="A">
        <div className="flex items-start gap-4">
          <DocumentThumb
            documentId={post.primarySourceDocumentId as unknown as string}
            title={post.primarySourceDocumentTitle ?? "Untitled"}
            fileType={post.fileType}
            variant="card"
          />
          <div className="min-w-0 flex-1">
            <div className="font-logo text-[16px] font-medium leading-tight tracking-tight">
              {post.primarySourceDocumentTitle ?? "Untitled"}
            </div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-muted-foreground">
              <FileTypeIcon fileType={post.fileType} className="size-3 text-muted-foreground/70" />
              {post.sectionTitle && <span className="truncate">{post.sectionTitle}</span>}
              {post.pageStart != null && (
                <>
                  {post.sectionTitle && <span className="text-foreground/30">&middot;</span>}
                  <span>
                    p. {post.pageStart}
                    {post.pageEnd && post.pageEnd !== post.pageStart ? `-${post.pageEnd}` : ""}
                  </span>
                </>
              )}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <Link
                to="/app/library/$documentId"
                params={{ documentId: post.primarySourceDocumentId }}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-colors hover:text-primary/80"
                onClick={() => posthog.capture("source.library_navigated", { postId: post._id })}
              >
                <BookOpen className="size-3" />
                Library
              </Link>
              {details?.sourceUrl && (
                <a
                  href={details.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-colors hover:text-primary/80"
                  onClick={() => posthog.capture("source.original_opened", { postId: post._id })}
                >
                  <ExternalLink className="size-3" />
                  Original
                </a>
              )}
            </div>
          </div>
        </div>
      </RailMarker>

      {(isPending || details?.sectionSummary) && (
        <RailMarker marker="B">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Section context
          </div>
          {isPending ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading context…
            </div>
          ) : (
            <blockquote className="border-l-2 border-amber-500/50 pl-4 font-logo text-[15px] leading-[1.6] text-foreground/90 italic">
              {details?.sectionSummary}
            </blockquote>
          )}
        </RailMarker>
      )}

      {details && details.tags.length > 0 && (
        <RailMarker marker="C">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {details.tags.map((t) => (
              <span
                key={t._id}
                className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                #{t.name}
              </span>
            ))}
          </div>
        </RailMarker>
      )}

      {details?.learningGoal && (
        <RailMarker marker="D">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Learning goal applied
          </div>
          <p className="font-logo text-[14.5px] leading-[1.6] text-foreground/85">
            {details.learningGoal}
          </p>
        </RailMarker>
      )}
    </>
  );
}
