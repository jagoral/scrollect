import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentDetailLoading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-6 h-8 w-64" />
      <Skeleton className="mt-3 h-5 w-48" />
      <div className="mt-8 space-y-3">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    </div>
  );
}
