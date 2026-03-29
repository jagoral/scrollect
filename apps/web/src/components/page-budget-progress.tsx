import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface PageBudgetProgressProps {
  pagesUsed: number;
  monthlyLimit: number;
  bonusPages: number;
  className?: string;
}

export function PageBudgetProgress({
  pagesUsed,
  monthlyLimit,
  bonusPages,
  className,
}: PageBudgetProgressProps) {
  const percentage = Math.min(100, (pagesUsed / monthlyLimit) * 100);
  const isNearLimit = percentage >= 80 && percentage < 100;
  const isExhausted = percentage >= 100 && bonusPages === 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">Page Budget</span>
        <span
          className={cn(
            "font-mono font-medium",
            isNearLimit && "text-amber-500",
            isExhausted && "text-destructive",
          )}
        >
          {pagesUsed.toLocaleString()} / {monthlyLimit.toLocaleString()}
        </span>
      </div>

      <Progress
        value={percentage}
        className="h-2"
        indicatorClassName={cn(isNearLimit && "bg-amber-500", isExhausted && "bg-destructive")}
      />

      {bonusPages > 0 && (
        <div className="flex items-center justify-between text-[10px] text-emerald-500">
          <span>Bonus pages available</span>
          <span className="font-mono">+{bonusPages.toLocaleString()}</span>
        </div>
      )}

      {isNearLimit && (
        <p className="text-[10px] text-amber-500">You're nearing your monthly limit.</p>
      )}

      {isExhausted && (
        <p className="text-[10px] text-destructive font-medium">
          Monthly budget exhausted. New uploads blocked.
        </p>
      )}
    </div>
  );
}
