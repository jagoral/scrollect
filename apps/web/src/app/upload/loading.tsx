export default function UploadLoading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Upload Content</h1>
        <p className="mt-1 text-muted-foreground">Add PDF or Markdown files to your library.</p>
      </div>
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-xl border-2 border-dashed border-muted-foreground/20 p-8">
        <div className="skeleton-shimmer h-16 w-16 rounded-2xl" />
        <div className="flex flex-col items-center gap-2">
          <div className="skeleton-shimmer h-5 w-48 rounded" />
          <div className="skeleton-shimmer h-4 w-40 rounded" />
        </div>
        <div className="skeleton-shimmer h-9 w-28 rounded-md" />
      </div>
    </div>
  );
}
