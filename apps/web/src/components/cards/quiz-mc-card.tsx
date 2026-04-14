import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CardShell, SourceBadge } from "./card-shell";
import type { PostCardData, QuizTypeData } from "./types";

interface QuizMcCardProps {
  post: PostCardData & { typeData: QuizTypeData };
}

export function QuizMcCard({ post }: QuizMcCardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { question, options, correctIndex, explanation } = post.typeData;
  const answered = selectedIndex !== null;

  function getOptionState(index: number): "correct" | "incorrect" | undefined {
    if (!answered) return undefined;
    if (index === correctIndex) return "correct";
    if (index === selectedIndex) return "incorrect";
    return undefined;
  }

  return (
    <CardShell post={post} quizVariant={post.typeData.variant}>
      <SourceBadge post={post} />
      <div data-testid="quiz-question" className="mb-3 text-sm font-medium text-foreground">
        {question}
      </div>
      <div className="space-y-2">
        {options.map((option, index) => {
          const isCorrect = index === correctIndex;
          const isSelected = index === selectedIndex;
          const optionState = getOptionState(index);

          return (
            <Button
              key={index}
              variant="outline"
              className={cn(
                "h-auto w-full justify-start whitespace-normal px-3 py-2.5 text-left text-sm transition-all",
                !answered && "hover:border-primary/40 hover:bg-primary/[0.08]",
                answered &&
                  isCorrect &&
                  "border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-700 animate-in zoom-in-95 duration-200 dark:text-emerald-400",
                answered &&
                  isSelected &&
                  !isCorrect &&
                  "border-red-500/40 bg-red-500/[0.06] text-red-700 animate-shake dark:text-red-400",
                answered && !isSelected && !isCorrect && "opacity-50",
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (!answered) setSelectedIndex(index);
              }}
              disabled={answered}
              data-testid="quiz-option"
              data-option-state={optionState}
            >
              <span className="flex items-center gap-2">
                {answered && isCorrect && (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                )}
                {answered && isSelected && !isCorrect && (
                  <XCircle className="size-4 shrink-0 text-red-500" />
                )}
                {option}
              </span>
            </Button>
          );
        })}
      </div>
      {answered && (
        <div
          data-testid="quiz-explanation"
          className={cn(
            "mt-3 rounded-lg border p-3 text-sm leading-relaxed text-muted-foreground",
            selectedIndex === correctIndex
              ? "border-emerald-500/30 bg-transparent"
              : "border-red-500/30 bg-transparent",
            "animate-in fade-in slide-in-from-top-2 duration-300",
          )}
        >
          {explanation}
        </div>
      )}
    </CardShell>
  );
}
