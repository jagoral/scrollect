import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "@scrollect/backend/convex/_generated/api";
import { useConvex } from "convex/react";
import { format } from "date-fns";
import { BookOpen, ExternalLink, Loader2, MousePointerClick, X } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { createContext, useCallback, useContext, useState } from "react";
import Markdown from "react-markdown";
import { toast } from "sonner";

import {
  DetailRail,
  DetailRailPlaceholder,
  DETAIL_RULED_BG_STYLE,
  RailMarker,
} from "@/components/detail-rail";
import { DocumentThumb, FileTypeIcon } from "@/components/documents/document-thumb";
import { InlineMarkdown } from "@/components/inline-markdown";
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
        <RelatedPostsMarker post={post} />
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
              {post.sectionTitle && (
                <span className="truncate">
                  <InlineMarkdown>{post.sectionTitle}</InlineMarkdown>
                </span>
              )}
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

// 2-row floor: a single related entry feels like UI noise rather than a thread
// of related ideas; we hide the rail until there are at least two siblings.
const RELATED_POSTS_VISIBLE_FLOOR = 2;

function RelatedPostsMarker({ post }: { post: PostView }) {
  const posthog = usePostHog();
  const convex = useConvex();
  const ctx = useDetailPanel();
  const [pendingId, setPendingId] = useState<PostView["_id"] | null>(null);
  const { data: related } = useQuery(
    convexQuery(api.feed.posts.listRelated, { postId: post._id, limit: 3 }),
  );

  if (!related || related.length < RELATED_POSTS_VISIBLE_FLOOR) return null;

  async function handleSelect(target: NonNullable<typeof related>[number]) {
    posthog.capture("feed.related_post_clicked", {
      source_post_id: post._id,
      target_post_id: target._id,
      target_post_type: target.postType,
    });
    setPendingId(target._id);
    try {
      const fullPost = await convex.query(api.feed.posts.getEnriched, { postId: target._id });
      if (fullPost) {
        ctx?.openDetail(fullPost);
      } else {
        toast("That post is no longer available.");
      }
    } catch (error) {
      posthog.captureException(error);
      toast.error("Couldn't open that post. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <RailMarker marker="E">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        See also
      </div>
      <ul className="divide-y divide-dashed divide-border/60">
        {related.map((entry) => {
          const isPending = pendingId === entry._id;
          return (
            <li key={entry._id}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  void handleSelect(entry);
                }}
                aria-label={`Open related ${postTypeLabel[entry.postType].toLowerCase()}: ${entry.summary}`}
                className="group grid w-full grid-cols-[90px_1fr] items-baseline gap-x-3 py-2.5 text-left transition-transform duration-150 ease-out hover:translate-x-0.5 focus-visible:translate-x-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-progress disabled:opacity-60"
                data-testid="detail-panel-related-post"
                data-post-type={entry.postType}
              >
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-[0.18em] decoration-current/[0.4] underline-offset-[5px] group-hover:underline group-focus-visible:underline",
                    postTypeText[entry.postType],
                  )}
                >
                  {postTypeLabel[entry.postType]}
                </span>
                <span className="flex items-center gap-2 font-logo text-[14px] leading-[1.55] text-foreground/80 transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
                  <span className="line-clamp-1 min-w-0 flex-1">{entry.summary}</span>
                  {isPending && (
                    <Loader2
                      aria-hidden
                      className="size-3 shrink-0 animate-spin text-muted-foreground"
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </RailMarker>
  );
}
