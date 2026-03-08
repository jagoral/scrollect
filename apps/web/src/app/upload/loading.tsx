import { Skeleton } from "@/components/ui/skeleton";

export default function UploadLoading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Upload Content</h1>
        <p className="mt-1 text-muted-foreground">Add PDF or Markdown files to your library.</p>
      </div>
      <Skeleton className="h-[320px] w-full rounded-xl" />
    </div>
  );
}
