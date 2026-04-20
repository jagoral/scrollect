import { Rss, Sparkles, Upload } from "lucide-react";
import type { ComponentType } from "react";

import { useLandingSection } from "@/hooks/use-landing-section";
import { cn } from "@/lib/utils";

const steps = [
  {
    number: 1,
    icon: Upload,
    title: "Upload your content",
    description: "Drop PDFs, paste articles, or add markdown. Adding content takes seconds.",
  },
  {
    number: 2,
    icon: Sparkles,
    title: "AI generates posts",
    description: "A dedicated AI agent extracts insights, quotes, and quizzes from your content.",
  },
  {
    number: 3,
    icon: Rss,
    title: "Scroll your feed",
    description: "Review bite-sized posts that help you remember and connect what you learn.",
  },
] satisfies Array<{
  number: number;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}>;

export function HowItWorksSection() {
  const { ref, isVisible } = useLandingSection("how_it_works");

  return (
    <section
      ref={ref}
      aria-labelledby="how-it-works-heading"
      className={cn(
        "border-t border-border px-4 py-16 md:py-20",
        "transition-[transform,opacity] duration-700 ease-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 md:mb-12">
          <span className="mb-3 inline-flex items-center border border-border px-3 py-1 text-xs tracking-widest text-muted-foreground uppercase">
            How it works
          </span>
          <h2
            id="how-it-works-heading"
            className="text-2xl font-bold tracking-[-0.02em] text-pretty sm:text-3xl"
          >
            Three steps from content to retention
          </h2>
          <p className="mt-2 max-w-lg text-muted-foreground">
            From raw content to lasting knowledge in under a minute - no manual note-taking
            required.
          </p>
        </div>

        <div className="grid border border-border md:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className={cn(
                "group relative bg-card px-6 py-8 transition-colors hover:bg-accent/30",
                i > 0 && "border-t border-border md:border-t-0 md:border-l",
              )}
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center border border-border text-primary transition-colors group-hover:border-primary/30">
                  <step.icon className="size-5" />
                </div>
                <span className="font-mono text-3xl font-bold text-border transition-colors group-hover:text-primary/20">
                  {String(step.number).padStart(2, "0")}
                </span>
              </div>
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
