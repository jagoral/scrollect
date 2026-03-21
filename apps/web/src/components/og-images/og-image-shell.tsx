import { cn } from "@/lib/utils";

export function OgImageShell({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn("relative h-[630px] w-[1200px] overflow-hidden font-sans", className)}
    >
      {children}
    </div>
  );
}
