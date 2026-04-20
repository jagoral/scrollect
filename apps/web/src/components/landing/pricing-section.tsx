import {
  FILE_SIZE_LIMITS_FREE,
  FILE_SIZE_LIMITS_PRO,
  formatFileSize,
} from "@scrollect/backend/src/platform/fileSizeLimits";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { usePostHog } from "posthog-js/react";

import { Button } from "@/components/ui/button";
import { useLandingSection } from "@/hooks/use-landing-section";
import { cn } from "@/lib/utils";

type PricingTier = {
  key: "free" | "pro";
  eyebrow: string;
  name: string;
  price: string;
  priceUnit: string;
  blurb: string;
  features: string[];
  ctaLabel: string;
  highlight: boolean;
};

const tiers: ReadonlyArray<PricingTier> = [
  {
    key: "free",
    eyebrow: "Start here",
    name: "Free",
    price: "$0",
    priceUnit: "forever",
    blurb: "See the loop end-to-end. Upload, generate, scroll - no commitment.",
    features: [
      "3 documents total",
      `PDF up to ${formatFileSize(FILE_SIZE_LIMITS_FREE.pdf)}, EPUB up to ${formatFileSize(FILE_SIZE_LIMITS_FREE.epub)}`,
      "YouTube videos up to 30 minutes",
      "All post types",
      "3 feed refreshes per hour",
    ],
    ctaLabel: "Get started",
    highlight: false,
  },
  {
    key: "pro",
    eyebrow: "For serious learners",
    name: "Pro",
    price: "$9.99",
    priceUnit: "per month",
    blurb: "Everything Scrollect does, with enough headroom to actually lean on it.",
    features: [
      "30 documents per month",
      `PDF up to ${formatFileSize(FILE_SIZE_LIMITS_PRO.pdf)}, EPUB up to ${formatFileSize(FILE_SIZE_LIMITS_PRO.epub)}`,
      "No YouTube duration cap",
      "Cross-document connections",
      "Highlights import",
      "15 feed refreshes per hour",
    ],
    ctaLabel: "Upgrade to Pro",
    highlight: true,
  },
];

export function PricingSection() {
  const posthog = usePostHog();
  const { ref, isVisible } = useLandingSection("pricing");

  return (
    <section
      ref={ref}
      aria-labelledby="pricing-heading"
      className={cn(
        "border-t border-border px-4 py-16 md:py-20",
        "transition-[transform,opacity] duration-700 ease-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 md:mb-14">
          <div className="mb-4 inline-flex items-center gap-2.5 text-muted-foreground">
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-primary" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.32em]">
              Pricing
            </span>
          </div>
          <h2
            id="pricing-heading"
            className="font-logo text-3xl font-semibold leading-[1.05] tracking-[-0.015em] text-pretty sm:text-4xl md:text-[2.75rem]"
          >
            One tier to try it, one tier to live in it
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
            No seats, no add-ons, no surprise usage bills. Free is enough to decide if Scrollect
            fits; Pro is enough to make it a habit.
          </p>
        </div>

        <div className="grid gap-0 border border-border md:grid-cols-2">
          {tiers.map((tier, i) => (
            <div
              key={tier.key}
              className={cn(
                "relative flex flex-col bg-card px-6 py-8 md:px-8 md:py-10",
                i > 0 && "border-t border-border md:border-t-0 md:border-l",
                tier.highlight && "border-l-[2px] border-l-primary md:border-l-[2px]",
              )}
            >
              {tier.highlight && (
                <span className="absolute top-4 right-4 inline-flex items-center border border-primary px-2 py-0.5 font-mono text-[10px] font-medium tracking-[0.22em] text-primary uppercase">
                  Recommended
                </span>
              )}

              <span className="font-mono text-[10px] font-medium tracking-[0.28em] text-muted-foreground uppercase">
                {tier.eyebrow}
              </span>
              <h3 className="mt-3 font-logo text-3xl font-semibold tracking-tight">{tier.name}</h3>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-mono text-[2.75rem] font-semibold tabular-nums tracking-tight text-foreground">
                  {tier.price}
                </span>
                <span className="text-sm text-muted-foreground">/ {tier.priceUnit}</span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted-foreground text-pretty">
                {tier.blurb}
              </p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        tier.highlight ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="text-foreground/90">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                render={<Link to="/signin" />}
                className={cn(
                  "mt-8 w-full transition-all active:scale-[0.97]",
                  tier.highlight
                    ? "border border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border bg-transparent text-foreground hover:bg-accent/50",
                )}
                onClick={() => posthog?.capture("landing_pricing_cta_clicked", { tier: tier.key })}
              >
                {tier.ctaLabel}
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs tracking-wide text-muted-foreground">
          Cancel any time. Polar.sh handles billing, VAT, and invoices.
        </p>
      </div>
    </section>
  );
}
