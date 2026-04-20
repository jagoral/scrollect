import { createContext, useCallback, useContext, useState } from "react";
import { X } from "lucide-react";

import { Post } from "@/components/posts";
import type { PostView } from "@/components/posts/types";
import { SourceDetailsContent } from "@/components/posts/source-detail-sheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

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

  if (!selectedPost) return null;

  if (isMobile) {
    return (
      <Sheet open onOpenChange={closeDetail}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-0 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto mb-1 mt-0 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
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
    <aside
      data-testid="feed-detail-panel"
      className="hidden min-h-[calc(100svh-3.5rem)] min-w-0 overflow-hidden bg-background lg:block"
    >
      <div className="sticky top-14 h-[calc(100svh-3.5rem)] overflow-y-auto">
        <div key={selectedPost._id} className="animate-in fade-in slide-in-from-top-2 duration-200">
          <DetailPanelContent post={selectedPost} onClose={closeDetail} />
        </div>
      </div>
    </aside>
  );
}

function DetailPanelContent({ post, onClose }: { post: PostView; onClose: () => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 px-6 py-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground uppercase">{post.postType}</span>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
      <div className="-mx-6 min-w-0 [&_article]:border-0 [&_article]:border-l-0 [&_article]:bg-transparent [&_article]:hover:bg-transparent">
        <Post post={post} />
      </div>
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Source
      </p>
      <SourceDetailsContent postId={post._id} documentId={post.primarySourceDocumentId} />
    </div>
  );
}
