import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/subscription")({
  ssr: false,
  component: SubscriptionPage,
});

function SubscriptionPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight">Subscription</h1>

      <section className="mt-8">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Free Tier</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Basic limits apply.</p>
              <ul className="mt-4 list-disc pl-5">
                <li>3 documents total</li>
                <li>Max 100 pages per document</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-emerald-500">
            <CardHeader>
              <CardTitle>Pro - $9.99/mo</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Everything you need for serious learning.</p>
              <ul className="mt-4 list-disc pl-5">
                <li>2,000 pages/month processing budget</li>
                <li>Unlimited documents</li>
                <li>Highlights import</li>
              </ul>
              <button className="mt-6 rounded bg-emerald-500 px-4 py-2 text-white">
                Subscribe with Polar
              </button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
