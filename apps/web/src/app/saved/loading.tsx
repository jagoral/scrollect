import { Skeleton } from "@/components/ui/skeleton";

export default function SavedLoading() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Saved</h1>
        <p className="mt-1 text-muted-foreground">Your bookmarked learning cards.</p>
      </div>
      <div className="grid gap-4">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    </div>
  );
}
