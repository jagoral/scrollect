import { Link } from "@tanstack/react-router";
import { FileText, Globe, StickyNote, Type } from "lucide-react";
import { usePostHog } from "posthog-js/react";

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
        "border-t border-border px-4 py-16 md:py-20",
        "transition-[transform,opacity] duration-700 ease-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      <div className="mx-auto max-w-5xl">
        <div className="border border-border bg-card px-6 py-12 text-center md:px-12 md:py-16">
          <h2
            id="cta-heading"
            className="text-3xl font-bold tracking-[-0.02em] text-pretty sm:text-4xl"
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
            className="mt-8 border border-primary bg-primary px-8 text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
            onClick={() => posthog?.capture("landing_cta_clicked", { location: "bottom_cta" })}
          >
            Try Scrollect Free
          </Button>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">
              Supports
            </span>
            {contentTypes.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 border border-border px-3 py-1 text-xs text-muted-foreground"
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
