import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, ChevronDown } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";

import { Post } from "@/components/posts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface BookmarkedPostsSectionProps {
  documentId: Id<"documents">;
}

export function BookmarkedPostsSection({ documentId }: BookmarkedPostsSectionProps) {
  const { data: bookmarkedPosts } = useQuery(
    convexQuery(api.content.bookmarks.listBookmarkedByDocument, { documentId }),
  );
  const posthog = usePostHog();
  const [isOpen, setIsOpen] = useState(false);

  if (bookmarkedPosts === undefined || bookmarkedPosts.length === 0) return null;

  return (
    <div data-testid="bookmarked-posts-section" className="mt-6 border-t border-border pt-5">
      <Collapsible
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (open) {
            posthog.capture("bookmarked_posts.expanded", {
              document_id: documentId,
              count: bookmarkedPosts.length,
            });
          }
        }}
      >
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
            />
          }
        >
          <Bookmark className="size-3.5" />
          Bookmarked posts ({bookmarkedPosts.length})
          <ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 border-y border-r border-border" data-testid="bookmarked-posts-list">
            {bookmarkedPosts.map((post) => (
              <Post key={post._id} post={post} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
