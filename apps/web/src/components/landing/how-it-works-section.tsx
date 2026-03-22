import { Rss, Sparkles, Upload } from "lucide-react";
import type { ComponentType } from "react";

import { StepAiProcessing, StepScrollFeed, StepUpload } from "@/components/illustrations";
import { useLandingSection } from "@/hooks/use-landing-section";
import { cn } from "@/lib/utils";

type IllustrationProps = {
  className?: string;
  role?: string;
  "aria-label"?: string;
};

const steps = [
  {
    number: 1,
    icon: Upload,
    title: "Upload your content",
    description: "Drop PDFs, paste articles, or add markdown. Adding content takes seconds.",
    Illustration: StepUpload,
    illustrationAlt: "Documents being uploaded into Scrollect",
  },
  {
    number: 2,
    icon: Sparkles,
    title: "AI generates learning cards",
    description: "A dedicated AI agent extracts insights, quotes, and quizzes from your content.",
    Illustration: StepAiProcessing,
    illustrationAlt: "AI transforming documents into learning cards",
  },
  {
    number: 3,
    icon: Rss,
    title: "Scroll your personal feed",
    description: "Review bite-sized cards that help you remember and connect what you learn.",
    Illustration: StepScrollFeed,
    illustrationAlt: "A personalized feed of learning cards",
  },
] satisfies Array<{
  number: number;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  Illustration: ComponentType<IllustrationProps>;
  illustrationAlt: string;
}>;

export function HowItWorksSection() {
  const { ref, isVisible } = useLandingSection("how_it_works");

  return (
    <section
      ref={ref}
      aria-labelledby="how-it-works-heading"
      className={cn(
        "relative px-4 py-16 md:py-20",
        "transition-[transform,opacity] duration-700 ease-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2
            id="how-it-works-heading"
            className="text-3xl font-bold tracking-tight text-pretty sm:text-4xl"
          >
            How it works
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Three steps from content to retention.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-10 md:mt-14 md:gap-20">
          {steps.map((step, i) => {
            const isReversed = i % 2 === 1;

            return (
              <div
                key={step.number}
                className={cn(
                  "relative flex flex-col items-center gap-4 md:flex-row md:items-center md:gap-12",
                  isReversed && "md:flex-row-reverse",
                )}
              >
                {/* Large faded step number */}
                <span
                  className="pointer-events-none absolute top-0 -left-4 font-bold leading-none text-foreground/[0.06] select-none text-[8rem] md:-left-8 md:text-[12rem]"
                  aria-hidden="true"
                >
                  {step.number}
                </span>

                {/* Text content */}
                <div className="relative z-10 flex flex-1 flex-col items-center text-center md:items-start md:text-left">
                  <div className="relative flex size-11 items-center justify-center rounded-xl bg-background text-primary shadow-sm ring-1 ring-primary/20 md:size-14">
                    <step.icon className="size-5 md:size-6" />
                    <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground md:size-6 md:text-xs">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold md:mt-4 md:text-xl">{step.title}</h3>
                  <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground md:mt-2">
                    {step.description}
                  </p>
                </div>

                {/* Illustration */}
                <div className="flex w-full flex-1 justify-center">
                  <step.Illustration
                    className="w-full max-w-sm"
                    role="img"
                    aria-label={step.illustrationAlt}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
