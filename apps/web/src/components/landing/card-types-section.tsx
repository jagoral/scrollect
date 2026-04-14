import { Brain, Lightbulb, Link2, List, Quote } from "lucide-react";
import { useState } from "react";

import { useLandingSection } from "@/hooks/use-landing-section";
import { cn } from "@/lib/utils";

import {
  PreviewConnectionCard,
  PreviewInsightCard,
  PreviewQuizCard,
  PreviewQuoteCard,
  PreviewSummaryCard,
} from "./preview-cards";

type CardTypeValue = "insight" | "quote" | "quiz" | "summary" | "connection";

const cardTypes: ReadonlyArray<{
  value: CardTypeValue;
  label: string;
  icon: typeof Lightbulb;
  accentColor: string;
  borderColor: string;
  description: string;
}> = [
  {
    value: "insight",
    label: "Insight",
    icon: Lightbulb,
    accentColor: "text-primary",
    borderColor: "border-l-primary",
    description: "Key takeaways distilled from your content - the ideas worth remembering.",
  },
  {
    value: "quote",
    label: "Quote",
    icon: Quote,
    accentColor: "text-amber-500 dark:text-amber-400",
    borderColor: "border-l-amber-500 dark:border-l-amber-400",
    description: "Memorable passages preserved with full attribution.",
  },
  {
    value: "quiz",
    label: "Quiz",
    icon: Brain,
    accentColor: "text-emerald-500 dark:text-emerald-400",
    borderColor: "border-l-emerald-500 dark:border-l-emerald-400",
    description: "Test yourself on what you read. Try clicking an answer.",
  },
  {
    value: "summary",
    label: "Summary",
    icon: List,
    accentColor: "text-blue-500 dark:text-blue-400",
    borderColor: "border-l-blue-500 dark:border-l-blue-400",
    description: "Section summaries condensed into scannable bullet points.",
  },
  {
    value: "connection",
    label: "Connection",
    icon: Link2,
    accentColor: "text-violet-500 dark:text-violet-400",
    borderColor: "border-l-violet-500 dark:border-l-violet-400",
    description: "AI finds links between ideas across different documents.",
  },
];

function CardPreview({ value }: { value: CardTypeValue }) {
  switch (value) {
    case "insight":
      return <PreviewInsightCard />;
    case "quote":
      return <PreviewQuoteCard />;
    case "quiz":
      return <PreviewQuizCard interactive />;
    case "summary":
      return <PreviewSummaryCard />;
    case "connection":
      return <PreviewConnectionCard />;
  }
}

export function CardTypesSection() {
  const { ref, isVisible } = useLandingSection("card_types");
  const [activeTab, setActiveTab] = useState<CardTypeValue>("insight");

  return (
    <section
      ref={ref}
      aria-labelledby="card-types-heading"
      className={cn(
        "border-t border-border px-4 py-16 md:py-20",
        "transition-[transform,opacity] duration-700 ease-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 md:mb-12">
          <span className="mb-3 inline-flex items-center border border-border px-3 py-1 text-xs tracking-widest text-muted-foreground uppercase">
            Card types
          </span>
          <h2
            id="card-types-heading"
            className="text-2xl font-bold tracking-[-0.02em] text-pretty sm:text-3xl"
          >
            Five ways to learn from every document
          </h2>
          <p className="mt-2 max-w-lg text-muted-foreground">
            Each card type reinforces knowledge differently - from active recall quizzes to
            cross-document connections.
          </p>
        </div>

        <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8">
          <div className="relative hidden md:block">
            <div className="sticky top-24">
              <CardPreview key={activeTab} value={activeTab} />
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Card types"
            className="flex flex-col border border-border"
          >
            {cardTypes.map((type, i) => {
              const isActive = type.value === activeTab;
              const Icon = type.icon;

              return (
                <button
                  key={type.value}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`panel-${type.value}`}
                  onClick={() => setActiveTab(type.value)}
                  className={cn(
                    "flex items-start gap-4 border-l-2 px-5 py-4 text-left transition-colors duration-150",
                    i > 0 && "border-t border-t-border",
                    isActive
                      ? cn(type.borderColor, "bg-card")
                      : "border-l-transparent hover:bg-accent/50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center transition-colors duration-150",
                      isActive ? type.accentColor : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <span
                      className={cn(
                        "text-sm font-semibold transition-colors duration-150",
                        isActive ? "text-foreground" : "text-foreground/80",
                      )}
                    >
                      {type.label}
                    </span>
                    <p
                      className={cn(
                        "mt-0.5 text-sm transition-colors duration-150",
                        isActive ? "text-muted-foreground" : "text-muted-foreground/60",
                      )}
                    >
                      {type.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="md:hidden" id={`panel-${activeTab}`} role="tabpanel">
            <CardPreview key={activeTab} value={activeTab} />
          </div>
        </div>
      </div>
    </section>
  );
}
