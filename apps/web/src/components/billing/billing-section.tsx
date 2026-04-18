import { useState } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";

import { DocumentUsageMeter } from "@/components/billing/document-usage-meter";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/hooks/use-billing";

export function BillingSection() {
  const { usage, openCustomerPortal, isPending } = useBilling();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (!usage) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Plan & usage</h2>

      <DocumentUsageMeter variant="card" onUpgradeClick={() => setUpgradeOpen(true)} />

      {usage.tier === "pro" && (
        <div className="mt-3 border border-border bg-card px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-muted-foreground" />
                <p className="text-sm font-medium">Manage billing</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Update payment method, view invoices, or cancel your subscription.
              </p>
            </div>
            <Button variant="outline" onClick={openCustomerPortal} disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ExternalLink className="size-4" />
              )}
              Open billing portal
            </Button>
          </div>
        </div>
      )}

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} source="settings_billing" />
    </section>
  );
}
