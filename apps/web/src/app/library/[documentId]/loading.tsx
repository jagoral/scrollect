export default function DocumentDetailLoading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="skeleton-shimmer h-5 w-32 rounded" />
      <div className="mt-6 flex items-center gap-2.5">
        <div className="skeleton-shimmer h-5 w-5 rounded" />
        <div className="skeleton-shimmer h-8 w-64 rounded" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="skeleton-shimmer h-5 w-20 rounded-full" />
        <div className="skeleton-shimmer h-4 w-12 rounded" />
        <div className="skeleton-shimmer h-4 w-24 rounded" />
      </div>
      <div className="animate-stagger-in mt-8 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-l-4 border-l-primary/20 p-4">
            <div className="flex items-center justify-between">
              <div className="skeleton-shimmer h-4 w-20 rounded" />
              <div className="skeleton-shimmer h-3 w-24 rounded" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="skeleton-shimmer h-4 w-full rounded" />
              <div className="skeleton-shimmer h-4 w-5/6 rounded" />
              <div className="skeleton-shimmer h-4 w-3/4 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
