import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PolarCheckoutButton } from "@/components/polar-checkout";

export const Route = createFileRoute("/_authenticated/app/subscription")({
  ssr: false,
  component: SubscriptionPage,
});

function SubscriptionPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 md:px-6">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Upgrade to Pro</h1>
        <p className="text-muted-foreground text-lg">
          Unlock serious learning limits to process massive books and unlimited articles.
        </p>
      </div>

      <section className="mt-8">
        <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
          <Card className="flex flex-col border-muted/50 bg-muted/10 shadow-none">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold">Free Tier</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between">
              <div className="mb-6">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-muted-foreground ml-1">/ month</span>
              </div>
              <ul className="mb-8 flex flex-col gap-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="bg-muted flex h-5 w-5 items-center justify-center rounded-full text-[10px]">
                    ✓
                  </span>
                  3 documents total limit
                </li>
                <li className="flex items-center gap-2">
                  <span className="bg-muted flex h-5 w-5 items-center justify-center rounded-full text-[10px]">
                    ✓
                  </span>
                  Max 100 pages per document
                </li>
                <li className="flex items-center gap-2">
                  <span className="bg-muted flex h-5 w-5 items-center justify-center rounded-full text-[10px]">
                    ✓
                  </span>
                  Basic feed generation
                </li>
              </ul>
              <Button variant="outline" className="w-full" disabled>
                Current Plan
              </Button>
            </CardContent>
          </Card>

          <Card className="relative flex flex-col border-emerald-500/50 bg-emerald-500/5 shadow-lg shadow-emerald-500/10">
            <div className="bg-emerald-500 text-primary-foreground absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider">
              Recommended
            </div>
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                Pro Tier
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between">
              <div className="mb-6">
                <span className="text-4xl font-bold">$9.99</span>
                <span className="text-muted-foreground ml-1">/ month</span>
              </div>
              <ul className="mb-8 flex flex-col gap-3 text-sm">
                <li className="flex items-center gap-2 font-medium">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-600 dark:text-emerald-400">
                    ✓
                  </span>
                  2,000 pages/month processing budget
                </li>
                <li className="flex items-center gap-2 font-medium">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-600 dark:text-emerald-400">
                    ✓
                  </span>
                  Unlimited documents
                </li>
                <li className="flex items-center gap-2 font-medium">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-600 dark:text-emerald-400">
                    ✓
                  </span>
                  Highlights import
                </li>
                <li className="flex items-center gap-2 font-medium">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-600 dark:text-emerald-400">
                    ✓
                  </span>
                  Cross-document connections
                </li>
              </ul>
              <PolarCheckoutButton />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
