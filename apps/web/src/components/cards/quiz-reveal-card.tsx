"use client";

import { Eye } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CardShell, SourceBadge } from "./card-shell";
import type { PostCardData, QuizTypeData } from "./types";

interface QuizRevealCardProps {
  post: PostCardData & { typeData: QuizTypeData };
}

export function QuizRevealCard({ post }: QuizRevealCardProps) {
  const [revealed, setRevealed] = useState(false);
  const { question, options, correctIndex, explanation } = post.typeData;

  return (
    <CardShell
      post={post}
      accentClassName="via-emerald-500/30 group-hover/card:via-emerald-500/60"
      quizVariant={post.typeData.variant}
    >
      <SourceBadge post={post} />
      <div data-testid="quiz-question" className="mb-3 text-sm font-medium text-foreground">
        {question}
      </div>
      {!revealed ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 border-emerald-500/20 text-emerald-600 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5 dark:text-emerald-400"
          onClick={() => setRevealed(true)}
          data-testid="quiz-reveal-button"
        >
          <Eye className="size-3.5" />
          Reveal answer
        </Button>
      ) : (
        <div
          data-testid="quiz-answer"
          className={cn(
            "space-y-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3",
            "animate-in fade-in slide-in-from-top-1 duration-200",
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
    </CardShell>
  );
}
