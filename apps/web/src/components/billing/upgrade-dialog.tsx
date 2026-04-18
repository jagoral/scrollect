import { Check, Loader2, Sparkles } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBilling } from "@/hooks/use-billing";

const PRO_PERKS = [
  "30 documents per month",
  "Larger files (50 MB PDF, 30 MB EPUB)",
  "No YouTube duration cap",
  "Cross-document connections",
  "Highlights import",
];

type UpgradeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  source?: string;
};

export function UpgradeDialog({
  open,
  onOpenChange,
  title = "You've hit your free tier limit",
  description = "Upgrade to Pro to keep adding content. Your existing feed, cards, and library stay exactly as they are.",
  source = "unknown",
}: UpgradeDialogProps) {
  const { upgradeToPro, isPending } = useBilling();
  const posthog = usePostHog();
  const hasTrackedOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      hasTrackedOpen.current = false;
      return;
    }
    if (hasTrackedOpen.current) return;
    hasTrackedOpen.current = true;
    posthog?.capture("billing.upgrade_dialog_opened", { source });
  }, [open, posthog, source]);

  const handleUpgradeClick = () => {
    posthog?.capture("billing.checkout_started", { source });
    void upgradeToPro();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 inline-flex w-fit items-center gap-2 border border-primary/40 bg-primary/5 px-3 py-1 text-[10px] font-medium tracking-[0.15em] text-primary uppercase">
            <Sparkles className="size-3" />
            Upgrade to Pro
          </div>
          <DialogTitle className="text-xl tracking-tight">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ul className="mt-2 space-y-2.5">
          {PRO_PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="text-foreground/90">{perk}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-baseline gap-2 border-t border-border pt-4">
          <span className="font-mono text-3xl font-bold tracking-tight">$9.99</span>
          <span className="text-sm text-muted-foreground">per month</span>
          <span className="ml-auto text-xs text-muted-foreground">Cancel any time</span>
        </div>

        <DialogFooter className="mt-4">
          <DialogClose render={<Button variant="outline" />}>Maybe later</DialogClose>
          <Button onClick={handleUpgradeClick} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Opening checkout
              </>
            ) : (
              "Continue to checkout"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
