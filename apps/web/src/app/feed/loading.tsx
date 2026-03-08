export default function FeedLoading() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
        <p className="mt-1 text-muted-foreground">Your AI-generated learning cards.</p>
      </div>
      <div className="animate-stagger-in grid gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-l-4 border-l-primary/20 p-5">
            <div className="space-y-2">
              <div className="skeleton-shimmer h-4 w-3/4 rounded" />
              <div className="skeleton-shimmer h-4 w-full rounded" />
              <div className="skeleton-shimmer h-4 w-5/6 rounded" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="skeleton-shimmer h-3 w-20 rounded" />
              <div className="skeleton-shimmer h-3 w-16 rounded" />
            </div>
            <div className="mt-3 flex items-center gap-1">
              <div className="skeleton-shimmer h-8 w-8 rounded-md" />
              <div className="skeleton-shimmer h-8 w-8 rounded-md" />
              <div className="skeleton-shimmer h-8 w-8 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
