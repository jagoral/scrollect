import { createContext, useCallback, useContext, useState } from "react";
import { MousePointerClick, X } from "lucide-react";

import { PostCard } from "@/components/post-card";
import type { PostCardData } from "@/components/cards/types";
import { SourceDetailsContent } from "@/components/cards/source-detail-sheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

type DetailPanelContextValue = {
  selectedPost: PostCardData | null;
  openDetail: (post: PostCardData) => void;
  closeDetail: () => void;
};

const DetailPanelContext = createContext<DetailPanelContextValue | null>(null);

export function useDetailPanel() {
  return useContext(DetailPanelContext);
}

export function DetailPanelProvider({ children }: { children: React.ReactNode }) {
  const [selectedPost, setSelectedPost] = useState<PostCardData | null>(null);

  const openDetail = useCallback((post: PostCardData) => {
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
    if (isMobile) return null;

    return (
      <aside className="-ml-px hidden flex-1 border-l border-border lg:block">
        <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] flex-col items-center justify-center px-6 text-center">
          <div className="flex size-12 items-center justify-center border border-border">
            <MousePointerClick className="size-5 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">Select a card</p>
          <p className="mt-1 max-w-[200px] text-xs text-muted-foreground">
            Click any card in the feed to see its full content and source details here.
          </p>
        </div>
      </aside>
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
          <div className="mx-auto mb-1 mt-0 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
          <SheetTitle className="sr-only">Card details</SheetTitle>
          <SheetDescription className="sr-only">Expanded view of learning card.</SheetDescription>
          <div key={selectedPost._id} className="animate-in fade-in duration-200">
            <DetailPanelContent post={selectedPost} onClose={closeDetail} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="-ml-px hidden flex-1 border-l border-border lg:block">
      <div className="sticky top-14 h-[calc(100svh-3.5rem)] overflow-y-auto">
        <div key={selectedPost._id} className="animate-in fade-in slide-in-from-top-2 duration-200">
          <DetailPanelContent post={selectedPost} onClose={closeDetail} />
        </div>
      </div>
    </aside>
  );
}

function DetailPanelContent({ post, onClose }: { post: PostCardData; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground uppercase">{post.postType}</span>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
      <div className="[&_article]:border-0 -mx-6 [&_article]:border-l-0 [&_article]:bg-transparent [&_article]:hover:bg-transparent">
        <PostCard post={post} />
      </div>
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Source
      </p>
      <SourceDetailsContent postId={post._id} documentId={post.primarySourceDocumentId} />
    </div>
  );
}
