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
        <div className="border border-border bg-card px-6 py-14 text-center md:px-12 md:py-20">
          <div className="mb-6 inline-flex items-center gap-2.5 text-muted-foreground">
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-primary" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.32em]">
              Start today
            </span>
          </div>
          <h2
            id="cta-heading"
            className="font-logo text-4xl font-semibold leading-[1.05] tracking-[-0.015em] text-pretty sm:text-5xl md:text-[3.5rem]"
          >
            Your highlights are fading.
            <br />
            <em className="not-italic text-primary">Start remembering.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
            Upload your first document in 30 seconds.
          </p>
          <Button
            size="lg"
            render={<Link to="/signin" />}
            className="mt-9 border border-primary bg-primary px-8 text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
            onClick={() => posthog?.capture("landing_cta_clicked", { location: "bottom_cta" })}
          >
            Try Scrollect Free
          </Button>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground/70">
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
