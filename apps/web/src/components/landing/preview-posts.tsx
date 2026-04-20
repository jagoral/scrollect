import { ArrowLeftRight, Bookmark, Check, ThumbsUp, X } from "lucide-react";
import { useState } from "react";

import { DocumentThumb, FileTypeIcon } from "@/components/documents/document-thumb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PreviewAccent = "primary" | "amber" | "blue" | "violet" | "emerald";

const accentRail: Record<PreviewAccent, string> = {
  primary: "bg-primary/60",
  amber: "bg-amber-500/60",
  blue: "bg-blue-500/60",
  violet: "bg-violet-500/60",
  emerald: "bg-emerald-500/60",
};

const accentText: Record<PreviewAccent, string> = {
  primary: "text-primary",
  amber: "text-amber-600 dark:text-amber-400",
  blue: "text-blue-600 dark:text-blue-400",
  violet: "text-violet-600 dark:text-violet-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
};

function PreviewPostShell({
  accent,
  kindLabel,
  kindSuffix,
  pageStart,
  documentId,
  documentTitle,
  fileType,
  children,
}: {
  accent: PreviewAccent;
  kindLabel: string;
  kindSuffix?: string;
  pageStart?: number;
  documentId: string;
  documentTitle: string;
  fileType: string;
  children: React.ReactNode;
}) {
  return (
    <article className="@container relative grid min-w-0 grid-cols-[24px_1fr] gap-2.5 border border-border bg-card px-2.5 pt-3 pb-2.5 text-card-foreground @[360px]:grid-cols-[32px_1fr] @[360px]:gap-4 @[360px]:px-4 @[360px]:pt-5 @[360px]:pb-4">
      <div aria-hidden className={cn("absolute inset-x-0 top-0 h-px", accentRail[accent])} />

      <aside className="flex flex-col items-center gap-1.5 pt-[2px] @[360px]:gap-2">
        <DocumentThumb
          documentId={documentId}
          title={documentTitle}
          fileType={fileType}
          variant="spine"
          className="h-10 w-[14px] @[360px]:h-14 @[360px]:w-[18px]"
        />
        <div className="h-full w-px bg-border" />
      </aside>

      <div className="min-w-0">
        <div className="mb-2.5 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground @[360px]:mb-3.5 @[360px]:text-[10.5px]">
          <div className="flex min-w-0 items-center gap-1.5 @[360px]:gap-2.5">
            <span className={cn("truncate font-medium", accentText[accent])}>{kindLabel}</span>
            {kindSuffix && (
              <>
                <span className="text-foreground/30">&middot;</span>
                <span className="truncate">{kindSuffix}</span>
              </>
            )}
          </div>
          {pageStart != null && (
            <span className="shrink-0 tracking-wide text-muted-foreground/70">p. {pageStart}</span>
          )}
        </div>

        {children}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2 @[360px]:mt-4 @[360px]:pt-2.5">
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground @[360px]:gap-2">
            <FileTypeIcon
              fileType={fileType}
              className="size-3 text-muted-foreground/70 @[360px]:size-3.5"
            />
            <span className="min-w-0 truncate font-logo text-[11.5px] font-medium text-foreground/85 @[360px]:text-[13px]">
              {documentTitle}
            </span>
          </div>
          <PreviewPostActions />
        </div>
      </div>
    </article>
  );
}

function PreviewPostActions() {
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);

  return (
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        title={saved ? "Unsave" : "Save for later"}
        className={cn(
          "size-6 rounded-none @[360px]:size-8",
          saved
            ? "bg-primary/10 text-primary hover:bg-primary/15"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        onClick={() => setSaved((s) => !s)}
      >
        <Bookmark className={cn("size-3 @[360px]:size-[15px]", saved && "fill-current")} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={liked ? "Remove like" : "Like this post"}
        className={cn(
          "size-6 rounded-none @[360px]:size-8",
          liked
            ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        onClick={() => setLiked((l) => !l)}
      >
        <ThumbsUp className={cn("size-3 @[360px]:size-[15px]", liked && "fill-current")} />
      </Button>
    </div>
  );
}

export function PreviewInsightPost() {
  return (
    <PreviewPostShell
      accent="primary"
      kindLabel="Insight"
      pageStart={34}
      documentId="preview-clean-code"
      documentTitle="Clean Code"
      fileType="pdf"
    >
      <p className="text-[12.5px] leading-[1.55] text-foreground/90 @[360px]:text-[15.5px] @[360px]:leading-[1.6]">
        Functions should do one thing. A function that handles both validation and persistence is
        doing two - split it.
      </p>
    </PreviewPostShell>
  );
}

export function PreviewQuotePost() {
  return (
    <PreviewPostShell
      accent="amber"
      kindLabel="Quote"
      pageStart={148}
      documentId="preview-thinking-slow"
      documentTitle="Thinking, Fast and Slow"
      fileType="epub"
    >
      <blockquote className="relative pl-4 font-logo text-[14px] font-medium leading-[1.35] tracking-tight text-foreground @[360px]:pl-7 @[360px]:text-[22px] @[360px]:leading-[1.3]">
        <span
          aria-hidden
          className="absolute -top-1 left-0 font-logo text-[28px] font-semibold leading-none text-amber-500/45 @[360px]:-top-2 @[360px]:text-[60px]"
        >
          &ldquo;
        </span>
        Nothing in life is as important as you think it is, while you are thinking about it.
      </blockquote>
      <p className="mt-1.5 pl-4 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-600/90 dark:text-amber-400/90 @[360px]:mt-3 @[360px]:pl-7 @[360px]:text-[11px]">
        &mdash; Daniel Kahneman
      </p>
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
    <PreviewPostShell
      accent="emerald"
      kindLabel="Quiz"
      kindSuffix="MC"
      pageStart={75}
      documentId="preview-ddia"
      documentTitle="Designing Data-Intensive Applications"
      fileType="pdf"
    >
      <p className="mb-2 font-logo text-[13px] font-medium leading-tight tracking-tight text-foreground @[360px]:mb-4 @[360px]:text-[18px]">
        What is the primary advantage of an append-only log over in-place updates?
      </p>
      <div className="flex flex-col gap-1 @[360px]:gap-1.5">
        {QUIZ_OPTIONS.map((option, i) => {
          const isCorrect = i === CORRECT_INDEX;
          const isPicked = i === selected;
          return (
            <button
              key={option}
              type="button"
              aria-disabled={!interactive || answered}
              tabIndex={interactive && !answered ? 0 : -1}
              disabled={!interactive || answered}
              onClick={() => {
                if (interactive && !answered) setSelected(i);
              }}
              className={cn(
                "grid grid-cols-[16px_1fr_14px] items-center gap-1.5 border border-border bg-transparent px-2 py-1 text-left text-[11.5px] leading-tight transition-colors @[360px]:grid-cols-[24px_1fr_18px] @[360px]:gap-2.5 @[360px]:px-3 @[360px]:py-2 @[360px]:text-[14px]",
                interactive &&
                  !answered &&
                  "cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/[0.05]",
                !interactive && "cursor-default",
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
                  "font-mono text-[9px] tracking-wider @[360px]:text-[11px]",
                  answered && isCorrect
                    ? "text-emerald-600 dark:text-emerald-400"
                    : answered && isPicked
                      ? "text-red-500"
                      : "text-foreground/35",
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="truncate">{option}</span>
              {answered && isCorrect && (
                <Check className="size-3 text-emerald-500 @[360px]:size-4" />
              )}
              {answered && isPicked && !isCorrect && (
                <X className="size-3 text-red-500 @[360px]:size-4" />
              )}
            </button>
          );
        })}
      </div>
    </PreviewPostShell>
  );
}

export function PreviewSummaryPost() {
  const bullets = [
    "Consistent hashing minimizes key redistribution when nodes join or leave the ring.",
    "Virtual nodes improve load balance across physical servers.",
    "The hash ring maps both keys and servers to positions on a fixed circle.",
  ];
  return (
    <PreviewPostShell
      accent="blue"
      kindLabel="Summary"
      pageStart={12}
      documentId="preview-sys-design"
      documentTitle="System Design Interview - Ch. 5"
      fileType="pdf"
    >
      <p className="mb-2 font-logo text-[14px] font-medium tracking-tight text-foreground @[360px]:mb-3 @[360px]:text-[18px]">
        Consistent hashing
      </p>
      <ol className="m-0 list-none p-0">
        {bullets.map((pt, i) => (
          <li
            key={i}
            className={cn(
              "grid grid-cols-[22px_1fr] gap-1 py-1 @[360px]:grid-cols-[30px_1fr] @[360px]:py-2",
              i > 0 && "border-t border-dashed border-border",
            )}
          >
            <span className="pt-0.5 font-mono text-[9.5px] tracking-wide text-blue-500 @[360px]:text-[11px]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[11.5px] leading-[1.5] text-foreground/90 @[360px]:text-[14px] @[360px]:leading-[1.55]">
              {pt}
            </span>
          </li>
        ))}
      </ol>
    </PreviewPostShell>
  );
}

export function PreviewConnectionPost() {
  return (
    <PreviewPostShell
      accent="violet"
      kindLabel="Connection"
      kindSuffix="Cross-source"
      documentId="preview-clean-code"
      documentTitle="Clean Code &amp; DDIA"
      fileType="pdf"
    >
      <div className="mb-2 grid grid-cols-[1fr_16px_1fr] items-stretch gap-1.5 @[360px]:mb-4 @[360px]:grid-cols-[1fr_28px_1fr] @[360px]:gap-3">
        <div className="border border-border bg-violet-500/[0.03] px-1.5 py-1.5 @[360px]:px-3 @[360px]:py-2.5">
          <div className="mb-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-violet-500 @[360px]:mb-1 @[360px]:text-[10px]">
            Source A
          </div>
          <div className="truncate text-[10px] text-muted-foreground/90 @[360px]:text-[12px]">
            Clean Code
          </div>
        </div>
        <div className="flex items-center justify-center text-violet-500">
          <ArrowLeftRight className="size-3 @[360px]:size-4" />
        </div>
        <div className="border border-border bg-violet-500/[0.03] px-1.5 py-1.5 @[360px]:px-3 @[360px]:py-2.5">
          <div className="mb-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-violet-500 @[360px]:mb-1 @[360px]:text-[10px]">
            Source B
          </div>
          <div className="truncate text-[10px] text-muted-foreground/90 @[360px]:text-[12px]">
            DDIA
          </div>
        </div>
      </div>
      <p className="font-logo text-[13px] font-normal leading-[1.4] tracking-tight text-foreground @[360px]:text-[17px] @[360px]:leading-[1.45]">
        The hardest part of software design is managing complexity at boundaries between components.
      </p>
    </PreviewPostShell>
  );
}
