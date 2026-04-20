import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type DetailRailProps = {
  children: ReactNode;
  testId: string;
};

export function DetailRail({ children, testId }: DetailRailProps) {
  return (
    <aside
      data-testid={testId}
      className="hidden min-w-0 overflow-hidden border-l border-border bg-background lg:fixed lg:right-0 lg:top-14 lg:bottom-0 lg:z-20 lg:block lg:w-[calc((100vw-var(--sidebar-width))*0.4)]"
    >
      {children}
    </aside>
  );
}

type DetailRailPlaceholderProps = {
  description: string;
  icon: LucideIcon;
  title: string;
};

export function DetailRailPlaceholder({
  description,
  icon: Icon,
  title,
}: DetailRailPlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex size-12 items-center justify-center border border-border">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export const DETAIL_RULED_BG_STYLE: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(0deg, transparent 0, transparent 27px, rgba(125,138,144,0.05) 27px, rgba(125,138,144,0.05) 28px)",
};

type RailMarkerProps = {
  marker: string;
  children: ReactNode;
  className?: string;
};

export function RailMarker({ marker, children, className }: RailMarkerProps) {
  return (
    <section className={cn("relative pl-6", className)}>
      <span
        aria-hidden
        className="absolute top-0 left-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50"
      >
        {marker}
      </span>
      {children}
    </section>
  );
}
