import { Link } from "@tanstack/react-router";
import { FileText, Globe, StickyNote, Type } from "lucide-react";
import { usePostHog } from "posthog-js/react";

import { CtaBackground } from "@/components/illustrations";
import { Button } from "@/components/ui/button";
import { useLandingSection } from "@/hooks/use-landing-section";
import { cn } from "@/lib/utils";

const contentTypes = [
  { icon: FileText, label: "PDF" },
  { icon: StickyNote, label: "Markdown" },
  { icon: Globe, label: "Articles" },
  { icon: Type, label: "Plain text" },
] as const;

export function BottomCtaSection() {
  const posthog = usePostHog();
  const { ref, isVisible } = useLandingSection("bottom_cta");

  return (
    <section
      ref={ref}
      aria-labelledby="cta-heading"
      className={cn(
        "relative overflow-hidden",
        "transition-[transform,opacity] duration-700 ease-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      <div className="relative bg-gradient-to-b from-foreground/[0.03] to-foreground/[0.08] px-4 py-16 dark:from-primary/[0.06] dark:to-primary/[0.02] md:py-20">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom,var(--color-primary)_0%,transparent_60%)] opacity-[0.06]" />

        <CtaBackground className="absolute inset-0 -z-10 size-full object-cover opacity-50" />

        <div className="relative mx-auto max-w-2xl text-center">
          <h2
            id="cta-heading"
            className="text-3xl font-bold tracking-tight text-pretty sm:text-4xl"
          >
            Your highlights are fading.
            <br />
            Start remembering.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">
            Upload your first document in 30 seconds.
          </p>
          <Button
            size="lg"
            render={<Link to="/signin" />}
            className="mt-8 px-8 shadow-[0_0_20px_-5px_var(--color-primary)] transition-shadow hover:shadow-[0_0_30px_-5px_var(--color-primary)] active:scale-[0.97]"
            onClick={() => posthog?.capture("landing_cta_clicked", { location: "bottom_cta" })}
          >
            Try Scrollect Free
          </Button>

          {/* Content type badges */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <span className="text-xs text-muted-foreground/60">Supports</span>
            {contentTypes.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-3 py-1 text-xs text-muted-foreground"
              >
                <Icon className="size-3" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
