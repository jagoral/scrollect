import { cn } from "@/lib/utils";

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      className={cn("absolute text-foreground/50", className)}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0 L9.6 5.6 L16 8 L9.6 10.4 L8 16 L6.4 10.4 L0 8 L6.4 5.6 Z" />
    </svg>
  );
}

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("h-[3px] rounded-full bg-foreground/15", className)} />;
}
