import { useState } from "react";

import { cn } from "@/lib/utils";

import { SkeletonLine, Sparkle } from "./primitives";

export function StepScrollFeed({
  className,
  ...props
}: {
  className?: string;
  role?: string;
  "aria-label"?: string;
}) {
  const [isActive, setIsActive] = useState(false);

  return (
    <div
      className={cn("relative aspect-[3/4] md:aspect-[4/3] w-full select-none", className)}
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
      {...props}
    >
      {/* Background glow behind phone */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[85%] w-[50%] rounded-[50%] bg-primary/[0.04]" />

      {/* Decorative dots (left side) */}
      <div className="absolute top-[20%] left-[10%] size-[6px] rounded-full bg-primary/20" />
      <div className="absolute top-[38%] left-[6%] size-[4px] rounded-full bg-primary/12" />
      <div className="absolute top-[55%] left-[12%] size-[5px] rounded-full bg-primary/18" />
      <div className="absolute top-[72%] left-[8%] size-[5px] rounded-full bg-primary/15" />

      {/* Phone frame */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] md:w-[40%]">
        <div className="overflow-hidden rounded-[20px] border-2 border-foreground/18 bg-white/45 shadow-md dark:bg-white/[0.06]">
          {/* Notch */}
          <div className="flex justify-center pt-[4%]">
            <div className="h-[5px] w-[34%] rounded-full bg-foreground/15" />
          </div>

          {/* Screen area */}
          <div className="mx-[5%] mt-[3%] overflow-hidden rounded-md bg-foreground/[0.02] p-[5%]">
            {/* Post stack */}
            <div
              className={cn(
                "space-y-[8px] transition-transform duration-500",
                isActive && "-translate-y-3",
              )}
            >
              {/* Quote post */}
              <div className="relative overflow-hidden rounded-md border border-foreground/12 bg-white/70 dark:bg-white/10">
                <div className="absolute top-0 bottom-0 left-0 w-[3px] rounded-l-md bg-amber-500/50" />
                <div className="py-[8px] pr-[8px] pl-[12px]">
                  <div className="flex items-start gap-[5px]">
                    <span className="mt-px font-serif text-[13px] font-bold leading-none text-amber-500/60">
                      {"\u201C"}
                    </span>
                    <div className="flex-1 space-y-[5px]">
                      <SkeletonLine className="w-full" />
                      <SkeletonLine className="w-[70%] bg-foreground/10" />
                      <SkeletonLine className="w-[50%] bg-foreground/[0.08]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Insight post */}
              <div className="relative overflow-hidden rounded-md border border-foreground/12 bg-white/70 dark:bg-white/10">
                <div className="absolute top-0 bottom-0 left-0 w-[3px] rounded-l-md bg-primary/50" />
                <div className="py-[8px] pr-[8px] pl-[12px]">
                  <div className="flex items-start gap-[6px]">
                    <div className="mt-[2px] flex size-[14px] shrink-0 items-center justify-center rounded-full border border-foreground/25">
                      <div className="size-[4px] rounded-full bg-primary/60" />
                    </div>
                    <div className="flex-1 space-y-[5px]">
                      <SkeletonLine className="w-full" />
                      <SkeletonLine className="w-[75%] bg-foreground/10" />
                      <SkeletonLine className="w-[55%] bg-foreground/[0.08]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Quiz post */}
              <div className="relative overflow-hidden rounded-md border border-foreground/12 bg-white/70 dark:bg-white/10">
                <div className="absolute top-0 bottom-0 left-0 w-[3px] rounded-l-md bg-emerald-500/50" />
                <div className="py-[8px] pr-[8px] pl-[12px]">
                  <div className="flex items-start gap-[5px]">
                    <span className="mt-px text-[10px] font-bold text-emerald-500/60">?</span>
                    <div className="flex-1 space-y-[4px]">
                      <SkeletonLine className="w-full" />
                      <div className="h-[10px] w-[80%] rounded border border-emerald-500/25 bg-emerald-500/[0.08]" />
                      <div className="h-[10px] w-[80%] rounded border border-emerald-500/25 bg-emerald-500/[0.08]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Partial post peeking */}
              <div className="h-[14px] rounded-t-md border border-b-0 border-foreground/[0.08] bg-white/30 dark:bg-white/[0.04]" />
            </div>
          </div>

          {/* Home indicator */}
          <div className="flex justify-center py-[4%]">
            <div className="h-[4px] w-[26%] rounded-full bg-foreground/12" />
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute right-[16%] top-[14%] flex h-[72%] flex-col items-center">
        {/* Up chevron */}
        <svg
          className="h-[10px] w-[10px] text-foreground/25"
          viewBox="0 0 12 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1 7L6 2L11 7" />
        </svg>

        {/* Track */}
        <div className="relative my-1 w-[1.5px] flex-1 rounded-full bg-foreground/10">
          {/* Thumb */}
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 size-[8px] rounded-full bg-primary/40 border border-foreground/15",
              "transition-all duration-500",
              isActive ? "top-[45%]" : "top-[25%]",
            )}
          />
        </div>

        {/* Down chevron */}
        <svg
          className="h-[10px] w-[10px] text-foreground/25"
          viewBox="0 0 12 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1 1L6 6L11 1" />
        </svg>
      </div>

      {/* Sparkles */}
      <Sparkle className="illust-sparkle-1 top-[8%] left-[18%] size-[7px]" />
      <Sparkle className="illust-sparkle-2 top-[12%] right-[12%] size-[6px]" />
      <Sparkle className="illust-sparkle-3 bottom-[10%] right-[14%] size-[5px]" />
      <Sparkle className="illust-sparkle-4 bottom-[18%] left-[16%] size-[5px]" />
      <Sparkle className="illust-sparkle-5 top-[5%] right-[30%] size-[4px]" />
    </div>
  );
}
