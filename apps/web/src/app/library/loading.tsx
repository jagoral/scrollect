import { Skeleton } from "@/components/ui/skeleton";

export default function LibraryLoading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">My Library</h1>
        <p className="mt-1 text-muted-foreground">
          Your uploaded documents and their processing status.
        </p>
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-[106px] w-full rounded-xl" />
        <Skeleton className="h-[106px] w-full rounded-xl" />
        <Skeleton className="h-[106px] w-full rounded-xl" />
      </div>
    </div>
  );
}
