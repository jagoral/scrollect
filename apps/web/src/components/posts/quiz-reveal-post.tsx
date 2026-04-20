import { Eye } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PostShell } from "./post-shell";
import type { PostView, QuizTypeData } from "./types";

interface QuizRevealPostProps {
  post: PostView & { typeData: QuizTypeData };
}

export function QuizRevealPost({ post }: QuizRevealPostProps) {
  const [revealed, setRevealed] = useState(false);
  const { question, options, correctIndex, explanation } = post.typeData;

  return (
    <PostShell post={post} quizVariant={post.typeData.variant}>
      <div>
        <p
          data-testid="quiz-question"
          className="mb-4 font-logo text-[20px] font-medium leading-tight tracking-tight text-foreground"
        >
          {question}
        </p>
        {!revealed ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 rounded-none border-emerald-500/30 text-emerald-600 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 dark:text-emerald-400"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(true);
            }}
            data-testid="quiz-reveal-button"
          >
            <Eye className="size-3.5" />
            Reveal answer
          </Button>
        ) : (
          <div
            data-testid="quiz-answer"
            className={cn(
              "space-y-2 border border-emerald-500/35 bg-transparent p-3.5",
              "animate-in fade-in slide-in-from-top-2 duration-300",
            )}
          >
            <p className="font-logo text-[16px] font-medium text-emerald-600 dark:text-emerald-400">
              {options[correctIndex] ?? "Answer unavailable"}
            </p>
            <p
              data-testid="quiz-explanation"
              className="text-[13.5px] leading-[1.55] text-foreground/85"
            >
              {explanation}
            </p>
          </div>
        )}
      </div>
    </PostShell>
  );
}
