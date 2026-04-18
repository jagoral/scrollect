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
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono tabular-nums text-foreground">
            {used} / {limit}
          </span>
          <span className="text-muted-foreground">
            documents {tier === "pro" ? "this cycle" : "used"}
          </span>
        </div>
        <div className="h-1.5 w-24 overflow-hidden bg-muted" aria-hidden>
          <div
            className={cn("h-full transition-[width] duration-300", barTone)}
            style={{ width: `${percent}%` }}
          />
        </div>
        {atLimit && tier === "free" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-primary text-primary hover:bg-primary/10"
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
