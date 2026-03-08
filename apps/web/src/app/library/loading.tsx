export default function LibraryLoading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">My Library</h1>
        <p className="mt-1 text-muted-foreground">
          Your uploaded documents and their processing status.
        </p>
      </div>
      <div className="animate-stagger-in grid gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border p-4">
            <div className="flex items-center gap-2.5">
              <div className="skeleton-shimmer h-4 w-4 rounded" />
              <div className="skeleton-shimmer h-5 w-48 rounded" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="skeleton-shimmer h-5 w-20 rounded-full" />
              <div className="skeleton-shimmer h-4 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
