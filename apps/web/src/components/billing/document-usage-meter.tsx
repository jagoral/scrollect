import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";

import { Button } from "@/components/ui/button";
import { useBilling } from "@/hooks/use-billing";
import { cn } from "@/lib/utils";

type DocumentUsageMeterProps = {
  onUpgradeClick?: () => void;
  variant?: "compact" | "card";
};

export function DocumentUsageMeter({
  onUpgradeClick,
  variant = "compact",
}: DocumentUsageMeterProps) {
  const { usage } = useBilling();

  if (!usage) return null;

  const { tier, used, limit, periodEnd } = usage;
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const remaining = Math.max(0, limit - used);
  const atLimit = used >= limit;
  const nearLimit = !atLimit && remaining <= Math.ceil(limit * 0.2);

  const periodLabel =
    tier === "pro" && periodEnd
      ? `Resets in ${formatDistanceToNowStrict(periodEnd)}`
      : tier === "pro"
        ? "Resets with billing cycle"
        : "Lifetime total";

  const barTone = atLimit
    ? "bg-destructive"
    : nearLimit
      ? "bg-amber-500 dark:bg-amber-400"
      : "bg-primary";

  if (variant === "compact") {
    return (
      <div className="flex flex-col items-start gap-1.5 md:items-end">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-medium tabular-nums text-foreground">
            {used}
            <span className="text-muted-foreground/50"> / {limit}</span>
          </span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            {tier === "pro" ? "This cycle" : "Used"}
          </span>
        </div>
        <div className="h-1 w-40 overflow-hidden bg-muted" aria-hidden>
          <div
            className={cn("h-full transition-[width] duration-300", barTone)}
            style={{ width: `${percent}%` }}
          />
        </div>
        {atLimit && tier === "free" && (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 h-7 border-primary text-primary hover:bg-primary/10"
            onClick={onUpgradeClick}
          >
            Upgrade
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="border border-border border-l-[2px] border-l-primary bg-card px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-muted-foreground uppercase">
            {tier === "pro" ? "Pro plan" : "Free plan"}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums tracking-tight">
            {used} <span className="text-muted-foreground">/ {limit}</span>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            documents {tier === "pro" ? "used this cycle" : "used"}
          </p>
        </div>
        {tier === "free" && (
          <Button
            size="sm"
            onClick={onUpgradeClick}
            render={onUpgradeClick ? undefined : <Link to="/app/settings" />}
          >
            Upgrade to Pro
          </Button>
        )}
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden bg-muted" aria-hidden>
        <div
          className={cn("h-full transition-[width] duration-300", barTone)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{periodLabel}</p>
    </div>
  );
}
