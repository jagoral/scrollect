import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * First-page loading skeleton for the feed route. Renders three placeholder cards
 * matching the post layout so layout shift on hydration is minimal.
 */
export function FeedSkeleton() {
  return (
    <div className="pb-6">
      <PageHeader
        eyebrow="Your Feed"
        title="Feed"
        description="Your AI-generated learning posts."
      />
      <div className="border-b border-border">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="border-l-[2px] border-l-muted border-t border-border first:border-t-0 px-6 pt-6 pb-5"
          >
            <Skeleton className="mb-3 h-4 w-32" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-4 h-4 w-3/4" />
            <div className="flex items-center justify-between border-t border-border pt-3">
              <Skeleton className="h-3 w-20" />
              <div className="flex gap-1">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-8 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
