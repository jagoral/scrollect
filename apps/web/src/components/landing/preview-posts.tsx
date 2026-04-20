import { Bookmark, Check, FileText, ThumbsUp, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function PreviewPostActions() {
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
        title={liked ? "Remove like" : "Like this post"}
        className={cn("transition-colors", liked && "text-primary")}
        onClick={() => setLiked((l) => !l)}
      >
        <ThumbsUp className={cn("size-3.5", liked && "fill-current")} />
      </Button>
    </div>
  );
}

function PreviewPostShell({
  accentClassName,
  children,
}: {
  accentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "group/card relative border border-border border-l-[2px] bg-card text-card-foreground transition-colors hover:bg-accent/30",
        accentClassName,
      )}
    >
      <div className="px-6 pt-6 pb-5">
        {children}
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs tracking-wide text-muted-foreground/70">2 hours ago</span>
          <PreviewPostActions />
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

export function PreviewInsightPost() {
  return (
    <PreviewPostShell accentClassName="border-l-primary/50">
      <PreviewSourceBadge label="Clean Code - Chapter 3" />
      <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <p>
          Functions should do one thing, do it well, and do it only. A function that handles both
          validation and persistence is doing two things - split it.
        </p>
      </div>
    </PreviewPostShell>
  );
}

export function PreviewQuotePost() {
  return (
    <PreviewPostShell accentClassName="border-l-amber-500/50">
      <PreviewSourceBadge label="Thinking, Fast and Slow - Part II" />
      <div>
        <blockquote className="text-base leading-relaxed text-foreground/90">
          Nothing in life is as important as you think it is, while you are thinking about it.
        </blockquote>
        <p className="mt-2 text-sm text-muted-foreground/70">&mdash; Daniel Kahneman</p>
        <p className="mt-1.5 line-clamp-2 text-xs not-italic text-muted-foreground/50">
          Kahneman introduces the focusing illusion - we overweight whatever we're currently
          attending to, distorting our judgment of its true importance.
        </p>
      </div>
    </PreviewPostShell>
  );
}

const QUIZ_OPTIONS = [
  "Faster random reads",
  "Simpler concurrency and crash recovery",
  "Lower disk space usage",
  "Better compression ratios",
] as const;

const CORRECT_INDEX = 1;

export function PreviewQuizPost({ interactive = false }: { interactive?: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;

  return (
    <PreviewPostShell accentClassName="border-l-emerald-500/50">
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
    </PreviewPostShell>
  );
}

export function PreviewSummaryPost() {
  return (
    <PreviewPostShell accentClassName="border-l-blue-500/50">
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
    </PreviewPostShell>
  );
}

export function PreviewConnectionPost() {
  return (
    <PreviewPostShell accentClassName="border-l-violet-500/50">
      <div className="mb-3 flex items-center gap-2">
        <Badge
          variant="outline"
          className="gap-1.5 border-violet-500/15 bg-violet-500/[0.03] font-normal text-muted-foreground"
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
    </PreviewPostShell>
  );
}
