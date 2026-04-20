import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { PostShell } from "./post-shell";
import type { PostView, QuizTypeData } from "./types";

interface QuizMcPostProps {
  post: PostView & { typeData: QuizTypeData };
  onViewed?: (postId: string) => void;
}

export function QuizMcPost({ post, onViewed }: QuizMcPostProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { question, options, correctIndex, explanation } = post.typeData;
  const answered = selectedIndex !== null;

  function getOptionState(i: number): "correct" | "incorrect" | undefined {
    if (!answered) return undefined;
    if (i === correctIndex) return "correct";
    if (i === selectedIndex) return "incorrect";
    return undefined;
  }

  return (
    <PostShell post={post} quizVariant={post.typeData.variant} onViewed={onViewed}>
      <div>
        <p
          data-testid="quiz-question"
          className="mb-4 font-logo text-[20px] font-medium leading-tight tracking-tight text-foreground"
        >
          {question}
        </p>
        <div className="flex flex-col gap-1.5">
          {options.map((option, i) => {
            const isCorrect = i === correctIndex;
            const isPicked = i === selectedIndex;
            const state = getOptionState(i);
            return (
              <button
                key={i}
                type="button"
                disabled={answered}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!answered) setSelectedIndex(i);
                }}
                data-testid="quiz-option"
                data-option-state={state}
                className={cn(
                  "grid grid-cols-[28px_1fr_auto] items-center gap-2.5 border border-border bg-transparent px-3.5 py-2.5 text-left text-[14.5px] transition-colors",
                  !answered && "cursor-pointer hover:border-primary/40 hover:bg-primary/5",
                  answered && isCorrect && "border-emerald-500/45 bg-emerald-500/[0.06]",
                  answered &&
                    isPicked &&
                    !isCorrect &&
                    "border-red-500/45 bg-red-500/[0.06] text-red-500",
                  answered && !isPicked && !isCorrect && "opacity-45",
                )}
              >
                <span
                  className={cn(
                    "font-mono text-[11px] tracking-wider",
                    answered && isCorrect
                      ? "text-emerald-600 dark:text-emerald-400"
                      : answered && isPicked
                        ? "text-red-500"
                        : "text-foreground/35",
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span>{option}</span>
                <span className="font-mono text-[10.5px] uppercase tracking-wider">
                  {answered && isCorrect && (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3.5" /> Correct
                    </span>
                  )}
                  {answered && isPicked && !isCorrect && (
                    <span className="inline-flex items-center gap-1 text-red-500">
                      <XCircle className="size-3.5" /> Your pick
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {answered && (
          <div
            data-testid="quiz-explanation"
            className={cn(
              "mt-3 border px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-foreground/85",
              selectedIndex === correctIndex ? "border-emerald-500/35" : "border-red-500/35",
            )}
          >
            {explanation}
          </div>
        )}
      </div>
    </PostShell>
  );
}
