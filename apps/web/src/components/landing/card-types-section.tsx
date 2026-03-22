import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLandingSection } from "@/hooks/use-landing-section";
import { cn } from "@/lib/utils";

import {
  PreviewConnectionCard,
  PreviewInsightCard,
  PreviewQuizCard,
  PreviewQuoteCard,
  PreviewSummaryCard,
} from "./preview-cards";

const cardTypes = [
  {
    value: "insight",
    label: "Insight",
    accentClass: "data-active:text-primary",
    description: "Key takeaways distilled from your content - the ideas worth remembering.",
    Card: PreviewInsightCard,
  },
  {
    value: "quote",
    label: "Quote",
    accentClass: "data-active:text-amber-600 dark:data-active:text-amber-400",
    description: "Memorable passages preserved with full attribution.",
    Card: PreviewQuoteCard,
  },
  {
    value: "quiz",
    label: "Quiz",
    accentClass: "data-active:text-emerald-600 dark:data-active:text-emerald-400",
    description: "Test yourself on what you read. Try clicking an answer.",
    Card: PreviewQuizCard,
    interactive: true,
  },
  {
    value: "summary",
    label: "Summary",
    accentClass: "data-active:text-blue-600 dark:data-active:text-blue-400",
    description: "Section summaries condensed into scannable bullet points.",
    Card: PreviewSummaryCard,
  },
  {
    value: "connection",
    label: "Connection",
    accentClass: "data-active:text-violet-600 dark:data-active:text-violet-400",
    description: "AI finds links between ideas across different documents.",
    Card: PreviewConnectionCard,
  },
] as const;

export function CardTypesSection() {
  const { ref, isVisible } = useLandingSection("card_types");

  return (
    <section
      ref={ref}
      aria-labelledby="card-types-heading"
      className={cn(
        "px-4 py-16 md:py-20",
        "transition-[transform,opacity] duration-700 ease-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      )}
    >
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h2
            id="card-types-heading"
            className="text-3xl font-bold tracking-tight text-pretty sm:text-4xl"
          >
            Five ways to learn from every document
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Each card type reinforces knowledge differently - from active recall quizzes to
            cross-document connections.
          </p>
        </div>

        <Tabs defaultValue="insight" className="mt-10">
          <TabsList
            variant="line"
            className="mx-auto flex w-full gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-center sm:gap-1"
          >
            {cardTypes.map((type) => (
              <TabsTrigger
                key={type.value}
                value={type.value}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium sm:px-4 sm:text-sm",
                  type.accentClass,
                )}
              >
                {type.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-8 min-h-[320px]">
            {cardTypes.map((type) => (
              <TabsContent key={type.value} value={type.value}>
                <div className="mx-auto max-w-xl">
                  <p className="mb-4 text-center text-sm text-muted-foreground">
                    {type.description}
                  </p>
                  {"interactive" in type && type.interactive ? (
                    <type.Card interactive />
                  ) : (
                    <type.Card />
                  )}
                </div>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </section>
  );
}
