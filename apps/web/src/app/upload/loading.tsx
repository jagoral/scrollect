import { Skeleton } from "@/components/ui/skeleton";

export default function UploadLoading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-xl border-2 border-dashed border-muted-foreground/20 p-8">
        <Skeleton className="h-16 w-16 rounded-2xl" />
        <div className="space-y-2 text-center">
          <Skeleton className="mx-auto h-5 w-48" />
          <Skeleton className="mx-auto h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  );
}
