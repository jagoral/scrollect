import { Bookmark, Check, FileText, ThumbsUp, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function PreviewCardActions() {
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        title={saved ? "Unsave" : "Save for later"}
        className={cn("transition-colors", saved && "text-primary")}
        onClick={() => setSaved((s) => !s)}
      >
        <Bookmark className={cn("size-3.5", saved && "fill-current")} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title={liked ? "Remove like" : "Like this card"}
        className={cn("transition-colors", liked && "text-primary")}
        onClick={() => setLiked((l) => !l)}
      >
        <ThumbsUp className={cn("size-3.5", liked && "fill-current")} />
      </Button>
    </div>
  );
}

function PreviewCardShell({
  accentClassName,
  cardType,
  children,
}: {
  accentClassName?: string;
  cardType: string;
  children: React.ReactNode;
}) {
  return (
    <article className="group/card relative overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/[0.06] transition-[box-shadow,ring-color] duration-300 hover:ring-primary/15 hover:shadow-lg hover:shadow-primary/[0.06]">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent transition-[height,color] duration-300 group-hover/card:h-0.5 group-hover/card:via-primary/60",
          accentClassName,
        )}
      />
      <div className="px-5 pt-5 pb-4">
        <Badge
          variant="outline"
          className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60"
        >
          {cardType}
        </Badge>
        {children}
        <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3">
          <span className="text-xs tracking-wide text-muted-foreground/70">2 hours ago</span>
          <PreviewCardActions />
        </div>
      </div>
    </article>
  );
}

function PreviewSourceBadge({ label }: { label: string }) {
  return (
    <div className="mb-3">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <FileText className="size-3 shrink-0" />
        <span className="max-w-64 truncate">{label}</span>
      </span>
    </div>
  );
}

export function PreviewInsightCard() {
  return (
    <PreviewCardShell cardType="Insight">
      <PreviewSourceBadge label="Clean Code - Chapter 3" />
      <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <p>
          Functions should do one thing, do it well, and do it only. A function that handles both
          validation and persistence is doing two things - split it.
        </p>
      </div>
    </PreviewCardShell>
  );
}

export function PreviewQuoteCard() {
  return (
    <PreviewCardShell
      cardType="Quote"
      accentClassName="via-amber-500/30 group-hover/card:via-amber-500/60"
    >
      <PreviewSourceBadge label="Thinking, Fast and Slow - Part II" />
      <div className="relative pl-4">
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-amber-500/40" />
        <span
          className="pointer-events-none absolute -left-1 -top-3 font-serif text-4xl leading-none text-amber-500/20 select-none"
          aria-hidden="true"
        >
          &ldquo;
        </span>
        <blockquote className="text-base leading-relaxed italic text-foreground/90">
          Nothing in life is as important as you think it is, while you are thinking about it.
        </blockquote>
        <p className="mt-2 text-sm text-muted-foreground/70">&mdash; Daniel Kahneman</p>
        <p className="mt-2 text-xs not-italic text-muted-foreground/50">
          Kahneman introduces the focusing illusion - we overweight whatever we're currently
          attending to, distorting our judgment of its true importance.
        </p>
      </div>
    </PreviewCardShell>
  );
}

const QUIZ_OPTIONS = [
  "Faster random reads",
  "Simpler concurrency and crash recovery",
  "Lower disk space usage",
  "Better compression ratios",
] as const;

const CORRECT_INDEX = 1;

export function PreviewQuizCard({ interactive = false }: { interactive?: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;

  return (
    <PreviewCardShell
      cardType="Quiz"
      accentClassName="via-emerald-500/30 group-hover/card:via-emerald-500/60"
    >
      <PreviewSourceBadge label="Designing Data-Intensive Applications" />
      <div className="mb-3 text-sm font-medium text-foreground">
        What is the primary advantage of an append-only log over in-place updates in a database
        storage engine?
      </div>
      <div className="flex flex-col gap-2">
        {QUIZ_OPTIONS.map((option, i) => {
          const isCorrect = i === CORRECT_INDEX;
          const isSelected = i === selected;

          let optionStyle = "";
          if (answered) {
            if (isCorrect) {
              optionStyle =
                "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
            } else if (isSelected) {
              optionStyle = "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400";
            } else {
              optionStyle = "opacity-50";
            }
          }

          return (
            <Button
              key={option}
              variant="outline"
              className={cn(
                "h-auto w-full justify-start whitespace-normal px-3 py-2.5 text-left text-sm transition-[color,background-color,border-color,opacity]",
                interactive &&
                  !answered &&
                  "cursor-pointer hover:border-emerald-500/30 hover:bg-emerald-500/5",
                !interactive && "cursor-default",
                optionStyle,
              )}
              tabIndex={interactive && !answered ? 0 : -1}
              aria-disabled={!interactive || answered}
              onClick={() => {
                if (interactive && !answered) setSelected(i);
              }}
            >
              <span className="flex-1">{option}</span>
              {answered && isCorrect && <Check className="ml-2 size-4 shrink-0 text-emerald-500" />}
              {answered && isSelected && !isCorrect && (
                <X className="ml-2 size-4 shrink-0 text-red-500" />
              )}
            </Button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          Append-only logs simplify concurrency control (no in-place overwrites to coordinate) and
          crash recovery (replay the log from the last checkpoint).
        </div>
      )}
    </PreviewCardShell>
  );
}

export function PreviewSummaryCard() {
  return (
    <PreviewCardShell
      cardType="Summary"
      accentClassName="via-blue-500/30 group-hover/card:via-blue-500/60"
    >
      <PreviewSourceBadge label="System Design Interview - Ch. 5" />
      <ul className="flex flex-col gap-2 text-sm leading-relaxed text-foreground/90">
        {[
          "Consistent hashing minimizes key redistribution when nodes join or leave",
          "Virtual nodes improve balance across physical servers",
          "The hash ring maps both keys and servers to positions on a fixed circle",
        ].map((point) => (
          <li key={point} className="flex gap-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue-500/60" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </PreviewCardShell>
  );
}

export function PreviewConnectionCard() {
  return (
    <PreviewCardShell
      cardType="Connection"
      accentClassName="via-violet-500/30 group-hover/card:via-violet-500/60"
    >
      <div className="mb-3 flex items-center gap-2">
        <Badge
          variant="outline"
          className="border-violet-500/30 text-[10px] font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400"
        >
          Cross-source
        </Badge>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
        <p>
          Both <span className="font-medium text-violet-600 dark:text-violet-400">Clean Code</span>{" "}
          and <span className="font-medium text-violet-600 dark:text-violet-400">DDIA</span> argue
          that the hardest part of software design is managing complexity at the boundaries between
          components.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-0.5 text-xs text-violet-600 dark:text-violet-400">
          <FileText className="size-2.5" /> Clean Code
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-0.5 text-xs text-violet-600 dark:text-violet-400">
          <FileText className="size-2.5" /> DDIA - Ch. 1
        </span>
      </div>
    </PreviewCardShell>
  );
}
