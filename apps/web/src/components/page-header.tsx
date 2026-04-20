import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn("border-b border-border px-4 pb-7 pt-8 md:px-8 md:pb-8 md:pt-10", className)}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-primary" />
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.32em] text-muted-foreground">
          {eyebrow}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-md">
          <h1 className="font-logo text-[2.5rem] font-semibold leading-[1.02] tracking-tight md:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-col items-start gap-3 md:items-end">{actions}</div>}
      </div>
    </header>
  );
}
