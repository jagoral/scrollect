import { useState } from "react";

import { cn } from "@/lib/utils";

import { SkeletonLine, Sparkle } from "./primitives";

function Fragment({ className, tinted }: { className?: string; tinted?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border border-foreground/15 bg-white/60 px-[6px] py-[4px] shadow-sm dark:bg-white/[0.08]",
        className,
      )}
    >
      <div className={cn("h-[3px] rounded-full bg-foreground/15", tinted && "bg-primary/20")} />
    </div>
  );
}

export function StepAiProcessing({
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
      className={cn("relative aspect-square w-full select-none md:aspect-[4/3]", className)}
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
      {...props}
    >
      {/* Background glow behind transformation zone */}
      <div
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[60%] w-[35%] rounded-[50%] bg-primary/[0.06] md:h-[70%]",
          "transition-all duration-500",
          isActive && "w-[40%] bg-primary/[0.10]",
        )}
      />

      {/* Source document (left) */}
      <div
        className={cn(
          "illust-float-1 absolute left-[4%] top-1/2 w-[40%] -translate-y-1/2 md:left-[6%] md:w-[30%]",
          "transition-opacity duration-500",
          isActive && "opacity-70",
        )}
      >
        <div className="rounded-lg border-[1.5px] border-foreground/20 bg-white/80 shadow-sm dark:bg-white/10">
          {/* Header bar */}
          <div className="h-[14px] rounded-t-lg bg-foreground/[0.08]" />
          {/* Text lines */}
          <div className="space-y-[5px] px-[10%] pt-[8%] pb-[4%]">
            <SkeletonLine className="w-[90%]" />
            <SkeletonLine className="w-[85%] bg-foreground/12" />
            <SkeletonLine className="w-[80%]" />
            <SkeletonLine className="w-[75%] bg-foreground/12" />
            <SkeletonLine className="w-[70%]" />
            <SkeletonLine className="w-[65%] bg-foreground/12" />
            <SkeletonLine className="w-[55%] bg-foreground/10" />
            <SkeletonLine className="w-[45%] bg-foreground/[0.08]" />
          </div>
          {/* Detaching lines */}
          <div className="space-y-[5px] px-[10%] pb-[6%]">
            <div className="ml-[8%] rotate-[2deg]">
              <SkeletonLine className="w-[50%] bg-foreground/[0.08]" />
            </div>
            <div className="ml-[14%] rotate-[4deg]">
              <SkeletonLine className="w-[35%] bg-foreground/[0.06]" />
            </div>
          </div>
        </div>
      </div>

      {/* Floating fragments (center) */}
      <Fragment
        className={cn(
          "illust-drift-1 absolute top-[10%] left-[38%] w-[16%] -rotate-6 md:left-[32%] md:w-[14%]",
          "transition-transform duration-500",
          isActive && "translate-x-2",
        )}
      />
      <Fragment
        className={cn(
          "illust-drift-2 absolute top-[28%] left-[42%] w-[20%] rotate-3 md:left-[35%] md:w-[18%]",
          "transition-transform duration-500",
          isActive && "translate-x-3",
        )}
      />
      <Fragment
        className={cn(
          "illust-drift-3 absolute top-[46%] left-[36%] w-[18%] -rotate-[8deg] md:left-[33%] md:w-[15%]",
          "transition-transform duration-500",
          isActive && "translate-x-2",
        )}
      />
      <Fragment
        className={cn(
          "illust-drift-1 absolute top-[62%] left-[40%] w-[18%] rotate-[5deg] md:left-[36%] md:w-[16%]",
          "transition-transform duration-500",
          isActive && "translate-x-3",
        )}
      />
      <Fragment
        className={cn(
          "illust-drift-2 absolute top-[76%] left-[38%] w-[15%] -rotate-3 md:left-[34%] md:w-[13%]",
          "transition-transform duration-500",
          isActive && "translate-x-2",
        )}
      />
      {/* Tinted fragment (near posts, transitioning) */}
      <Fragment
        tinted
        className={cn(
          "illust-drift-3 absolute top-[50%] left-[55%] w-[14%] rotate-[4deg] md:left-[52%] md:w-[12%]",
          "transition-transform duration-500",
          isActive && "translate-x-2",
        )}
      />

      {/* Emerging posts (right) */}
      <div className="absolute right-[4%] top-1/2 w-[44%] -translate-y-1/2 md:right-[6%] md:w-[33%]">
        <div
          className={cn(
            "space-y-[6px]",
            "transition-transform duration-500",
            isActive && "scale-[1.03]",
          )}
        >
          {/* Quote post */}
          <div className="illust-post-1 relative overflow-hidden rounded-lg border-[1.5px] border-foreground/18 bg-white/75 shadow-sm dark:bg-white/10">
            <div className="absolute top-0 bottom-0 left-0 w-[3px] rounded-l-lg bg-amber-500/50" />
            <div className="py-[7px] pr-[8px] pl-[12px]">
              <div className="flex items-start gap-[5px]">
                <span className="mt-px font-serif text-[12px] font-bold leading-none text-amber-500/60">
                  {"\u201C"}
                </span>
                <div className="flex-1 space-y-[4px]">
                  <SkeletonLine className="w-full" />
                  <SkeletonLine className="w-[70%] bg-foreground/10" />
                  <SkeletonLine className="w-[50%] bg-foreground/[0.08]" />
                </div>
              </div>
            </div>
          </div>

          {/* Insight post */}
          <div className="illust-post-2 relative overflow-hidden rounded-lg border-[1.5px] border-foreground/18 bg-white/75 shadow-sm dark:bg-white/10">
            <div className="absolute top-0 bottom-0 left-0 w-[3px] rounded-l-lg bg-primary/50" />
            <div className="py-[7px] pr-[8px] pl-[12px]">
              <div className="flex items-start gap-[6px]">
                <div className="mt-[2px] flex size-[14px] shrink-0 items-center justify-center rounded-full border border-foreground/25">
                  <div className="size-[4px] rounded-full bg-primary/60" />
                </div>
                <div className="flex-1 space-y-[4px]">
                  <SkeletonLine className="w-full" />
                  <SkeletonLine className="w-[75%] bg-foreground/10" />
                  <SkeletonLine className="w-[55%] bg-foreground/[0.08]" />
                </div>
              </div>
            </div>
          </div>

          {/* Quiz post */}
          <div className="illust-post-3 relative overflow-hidden rounded-lg border-[1.5px] border-foreground/18 bg-white/75 shadow-sm dark:bg-white/10">
            <div className="absolute top-0 bottom-0 left-0 w-[3px] rounded-l-lg bg-emerald-500/50" />
            <div className="py-[7px] pr-[8px] pl-[12px]">
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
        </div>
      </div>

      {/* Sparkles */}
      <Sparkle className="illust-sparkle-1 top-[6%] left-[36%] size-[7px]" />
      <Sparkle className="illust-sparkle-2 top-[15%] right-[30%] size-[6px]" />
      <Sparkle className="illust-sparkle-3 bottom-[12%] left-[40%] size-[6px]" />
      <Sparkle className="illust-sparkle-4 top-[40%] left-[28%] size-[5px]" />
      <Sparkle className="illust-sparkle-5 bottom-[25%] right-[32%] size-[5px]" />
    </div>
  );
}
