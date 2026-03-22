import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { SkeletonLine, Sparkle } from "./primitives";

export function StepUpload({
  className,
  ...props
}: {
  className?: string;
  role?: string;
  "aria-label"?: string;
}) {
  const [isActive, setIsActive] = useState(false);
  const [isDropped, setIsDropped] = useState(false);
  const dragCounter = useRef(0);
  const dropTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(dropTimerRef.current);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setIsActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current === 0) setIsActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsActive(false);
    setIsDropped(true);
    clearTimeout(dropTimerRef.current);
    dropTimerRef.current = setTimeout(() => setIsDropped(false), 800);
  }, []);

  return (
    <div
      className={cn("relative aspect-[3/4] md:aspect-[4/3] w-full select-none", className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
      {...props}
    >
      {/* Soft background glow behind drop zone */}
      <div
        className={cn(
          "absolute left-1/2 top-[15%] -translate-x-1/2 h-[35%] w-[70%] rounded-[50%] bg-primary/[0.05]",
          "transition-all duration-500",
          isActive && "h-[45%] w-[80%] bg-primary/[0.10]",
          isDropped && "bg-primary/[0.15]",
        )}
      />

      {/* Drop zone */}
      <div className="absolute top-[4%] left-1/2 -translate-x-1/2 w-[75%] md:top-[6%] md:w-[65%]">
        <div
          className={cn(
            "illust-portal-glow flex flex-col items-center justify-center",
            "rounded-2xl border-[2px] border-dashed border-primary/35",
            "bg-primary/[0.04] px-4 py-[10%]",
            "transition-all duration-300",
            isActive &&
              "border-primary/70 bg-primary/[0.10] scale-105 shadow-[0_0_24px_rgba(14,157,150,0.30)]",
            isDropped &&
              "border-primary/80 bg-primary/[0.14] scale-110 shadow-[0_0_32px_rgba(14,157,150,0.40)]",
          )}
        >
          {/* Upload arrow */}
          <svg
            className={cn(
              "h-[20px] w-[20px] text-primary/50 transition-all duration-300",
              isActive && "-translate-y-1 text-primary/80",
              isDropped && "-translate-y-2 text-primary",
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </div>
      </div>

      {/* PDF (left) */}
      <div
        className={cn(
          "illust-float-1 absolute bottom-[4%] left-[4%] w-[34%] -rotate-6 md:left-[6%] md:w-[28%]",
          "transition-transform duration-500",
          isActive && "-translate-y-3 -rotate-3",
          isDropped && "-translate-y-8 -rotate-1 opacity-60",
        )}
      >
        <div className="rounded-lg border-[1.5px] border-foreground/20 bg-white/80 shadow-sm dark:bg-white/10">
          <div className="h-[16px] rounded-t-lg bg-red-400/15" />
          <div className="space-y-[5px] px-[10%] pt-[8%] pb-[6%]">
            <SkeletonLine className="w-[80%]" />
            <SkeletonLine className="w-[55%] bg-foreground/10" />
            <SkeletonLine className="w-[70%]" />
            <SkeletonLine className="w-[45%] bg-foreground/10" />
            <SkeletonLine className="w-[62%]" />
          </div>
          <span className="block px-[10%] pb-[6%] text-[9px] font-bold text-red-400/60">PDF</span>
        </div>
      </div>

      {/* URL / Article (center) */}
      <div
        className={cn(
          "illust-float-2 absolute bottom-[8%] left-1/2 w-[36%] -translate-x-1/2 rotate-2 md:w-[30%]",
          "transition-transform duration-500",
          isActive && "-translate-y-4 rotate-0",
          isDropped && "-translate-y-10 opacity-60",
        )}
      >
        <div className="overflow-hidden rounded-lg border-[1.5px] border-foreground/20 bg-white/80 shadow-sm dark:bg-white/10">
          <div className="flex items-center gap-[3px] bg-primary/10 px-[8%] py-[5px]">
            <div className="size-[4px] rounded-full bg-foreground/25" />
            <div className="size-[4px] rounded-full bg-foreground/25" />
            <div className="size-[4px] rounded-full bg-foreground/25" />
            <div className="ml-1 h-[3px] flex-1 rounded-full bg-primary/20" />
          </div>
          <div className="space-y-[5px] px-[8%] pt-[6%] pb-[8%]">
            <div className="flex gap-[6px]">
              <div className="aspect-square w-[30%] shrink-0 rounded bg-foreground/[0.07]" />
              <div className="flex-1 space-y-[5px] pt-[2px]">
                <SkeletonLine className="w-full" />
                <SkeletonLine className="w-[65%] bg-foreground/10" />
              </div>
            </div>
            <SkeletonLine className="w-[85%]" />
            <SkeletonLine className="w-[60%] bg-foreground/10" />
          </div>
        </div>
      </div>

      {/* Markdown (right) */}
      <div
        className={cn(
          "illust-float-3 absolute right-[4%] bottom-[2%] w-[32%] rotate-[5deg] md:right-[6%] md:w-[26%]",
          "transition-transform duration-500",
          isActive && "-translate-y-3 rotate-[2deg]",
          isDropped && "-translate-y-8 rotate-0 opacity-60",
        )}
      >
        <div className="rounded-lg border-[1.5px] border-foreground/20 bg-white/80 px-[10%] pt-[8%] pb-[6%] shadow-sm dark:bg-white/10">
          <div className="mb-[5px] flex items-center gap-[4px]">
            <span className="text-[11px] font-bold leading-none text-amber-500/55">#</span>
            <div className="h-[3px] w-[45%] rounded-full bg-amber-500/25" />
          </div>
          <div className="space-y-[5px]">
            <SkeletonLine className="w-[78%]" />
            <SkeletonLine className="w-[52%] bg-foreground/10" />
            <SkeletonLine className="w-[66%]" />
            <SkeletonLine className="w-[44%] bg-foreground/10" />
          </div>
          <span className="mt-[6px] block text-[9px] font-bold text-amber-500/55">.md</span>
        </div>
      </div>

      {/* Rising particles */}
      <div
        className={cn(
          "illust-particle-rise absolute bottom-[42%] left-[22%] size-[5px] rounded-full transition-opacity duration-300",
          isActive ? "bg-primary/50" : "bg-primary/30",
        )}
      />
      <div
        className={cn(
          "illust-particle-rise absolute bottom-[45%] left-[48%] size-[4px] rounded-full",
          isActive ? "bg-primary/45" : "bg-primary/25",
        )}
        style={{ animationDelay: "0.8s" }}
      />
      <div
        className={cn(
          "illust-particle-rise absolute bottom-[40%] right-[24%] size-[4px] rounded-full",
          isActive ? "bg-primary/50" : "bg-primary/30",
        )}
        style={{ animationDelay: "1.6s" }}
      />
      <div
        className="illust-particle-rise absolute bottom-[44%] left-[35%] size-[3px] rounded-full bg-primary/20"
        style={{ animationDelay: "2.4s" }}
      />
      <div
        className="illust-particle-rise absolute bottom-[43%] right-[38%] size-[3px] rounded-full bg-primary/22"
        style={{ animationDelay: "1.2s" }}
      />

      {/* Sparkles */}
      <Sparkle className="illust-sparkle-1 top-[4%] left-[12%] size-[7px]" />
      <Sparkle className="illust-sparkle-2 top-[8%] right-[14%] size-[6px]" />
      <Sparkle className="illust-sparkle-3 top-[22%] right-[10%] size-[5px]" />
      <Sparkle className="illust-sparkle-4 top-[18%] left-[10%] size-[5px]" />
      <Sparkle className="illust-sparkle-5 top-[3%] left-[45%] size-[4px]" />
    </div>
  );
}
