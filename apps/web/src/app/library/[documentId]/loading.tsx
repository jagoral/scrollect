import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentDetailLoading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Skeleton className="h-5 w-32" />
      <div className="mt-6 flex items-center gap-2.5">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="animate-stagger-in mt-8 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-l-4 border-l-primary/20 p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
