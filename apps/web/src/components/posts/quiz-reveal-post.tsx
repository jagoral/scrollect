import { Eye } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PostShell, SourceBadge } from "./post-shell";
import type { PostView, QuizTypeData } from "./types";

interface QuizRevealPostProps {
  post: PostView & { typeData: QuizTypeData };
}

export function QuizRevealPost({ post }: QuizRevealPostProps) {
  const [revealed, setRevealed] = useState(false);
  const { question, options, correctIndex, explanation } = post.typeData;

  return (
    <PostShell post={post} quizVariant={post.typeData.variant}>
      <SourceBadge post={post} />
      <div data-testid="quiz-question" className="mb-3 text-sm font-medium text-foreground">
        {question}
      </div>
      {!revealed ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 border-emerald-500/30 text-emerald-600 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 dark:text-emerald-400"
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
            "space-y-2 border border-emerald-500/30 bg-transparent p-3",
            "animate-in fade-in slide-in-from-top-2 duration-300",
          )}
        >
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            {options[correctIndex] ?? "Answer unavailable"}
          </p>
          <p
            data-testid="quiz-explanation"
            className="text-sm leading-relaxed text-muted-foreground"
          >
            {explanation}
          </p>
        </div>
      )}
    </PostShell>
  );
}
