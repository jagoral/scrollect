import { Brain, Lightbulb, Link2, List, Quote } from "lucide-react";
import { useState } from "react";

import { useLandingSection } from "@/hooks/use-landing-section";
import { cn } from "@/lib/utils";

import {
  PreviewConnectionPost,
  PreviewInsightPost,
  PreviewQuizPost,
  PreviewQuotePost,
  PreviewSummaryPost,
} from "./preview-posts";

type PostTypeValue = "insight" | "quote" | "quiz" | "summary" | "connection";

const postTypes: ReadonlyArray<{
  value: PostTypeValue;
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

function PostPreview({ value }: { value: PostTypeValue }) {
  switch (value) {
    case "insight":
      return <PreviewInsightPost />;
    case "quote":
      return <PreviewQuotePost />;
    case "quiz":
      return <PreviewQuizPost interactive />;
    case "summary":
      return <PreviewSummaryPost />;
    case "connection":
      return <PreviewConnectionPost />;
  }
}

export function PostTypesSection() {
  const { ref, isVisible } = useLandingSection("post_types");
  const [activeTab, setActiveTab] = useState<PostTypeValue>("insight");

  return (
    <section
      ref={ref}
      aria-labelledby="post-types-heading"
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
              Post types
            </span>
          </div>
          <h2
            id="post-types-heading"
            className="font-logo text-3xl font-semibold leading-[1.05] tracking-[-0.015em] text-pretty sm:text-4xl md:text-[2.75rem]"
          >
            Five ways to learn from every document
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
            Each post type reinforces knowledge differently - from active recall quizzes to
            cross-document connections.
          </p>
        </div>

        <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8">
          <div className="relative hidden md:block">
            <div className="sticky top-24">
              <PostPreview key={activeTab} value={activeTab} />
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Post types"
            className="flex flex-col border border-border"
          >
            {postTypes.map((type, i) => {
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
                        "font-logo text-lg font-semibold leading-tight tracking-tight transition-colors duration-150",
                        isActive ? "text-foreground" : "text-foreground/80",
                      )}
                    >
                      {type.label}
                    </span>
                    <p
                      className={cn(
                        "mt-1 text-sm leading-relaxed transition-colors duration-150 text-pretty",
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
            <PostPreview key={activeTab} value={activeTab} />
          </div>
        </div>
      </div>
    </section>
  );
}
