import { Check, Cog, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const PROCESSING_STAGES = [
  { key: "uploaded", label: "Queued for processing", hint: null },
  { key: "parsing", label: "Parsing text", hint: "may take a minute for large files" },
  { key: "chunking", label: "Splitting into chunks", hint: null },
  { key: "embedding", label: "Creating embeddings", hint: null },
  { key: "summarizing", label: "Summarizing content", hint: "1-2 min" },
  { key: "generating_cards", label: "Generating learning posts", hint: "1-3 min" },
] as const;

export type ProcessingStage = (typeof PROCESSING_STAGES)[number]["key"];

function getStageIndex(status: string): number {
  return PROCESSING_STAGES.findIndex((s) => s.key === status);
}

export function ProcessingProgress({ status }: { status: ProcessingStage }) {
  const currentIndex = getStageIndex(status);
  if (currentIndex === -1) return null;

  return (
    <div className="mt-10" data-testid="processing-progress">
      <div
        className="border border-border bg-card p-5"
        role="status"
        aria-label="Processing progress"
      >
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center border border-primary/30">
            <Cog
              className="size-4 animate-spin text-primary/70"
              style={{ animationDuration: "3s" }}
            />
          </div>
          <p className="text-sm font-medium tracking-tight">Processing your document</p>
        </div>

        <div className="flex flex-col">
          {PROCESSING_STAGES.map((stage, index) => {
            const isComplete = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isPending = index > currentIndex;
            const isLast = index === PROCESSING_STAGES.length - 1;

            return (
              <div key={stage.key} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center transition-all duration-300",
                      isComplete &&
                        "border border-emerald-500/30 bg-transparent text-emerald-600 dark:text-emerald-400",
                      isCurrent && "border border-primary/30 bg-transparent text-primary",
                      isPending && "border border-border bg-transparent text-muted-foreground/30",
                    )}
                  >
                    {isComplete ? (
                      <Check className="size-3" strokeWidth={2.5} />
                    ) : isCurrent ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <span className="size-1 rounded-full bg-current opacity-50" />
                    )}
                  </div>
                  {!isLast && (
                    <div
                      className={cn(
                        "my-0.5 h-4 w-px transition-colors duration-300",
                        isComplete ? "bg-emerald-500/30 dark:bg-emerald-500/25" : "bg-border",
                      )}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "pt-0.5 text-[13px] leading-6 transition-colors duration-300",
                    isComplete && "text-muted-foreground",
                    isCurrent && "font-medium text-foreground",
                    isPending && "text-muted-foreground/40",
                  )}
                >
                  {stage.label}
                  {isCurrent && stage.hint && (
                    <span className="ml-1.5 font-normal text-muted-foreground/60">
                      - {stage.hint}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground/70">
        Processing typically takes 3-5 minutes. You can navigate away or close the app - we'll keep
        working in the background.
      </p>
    </div>
  );
}

export function ProcessingProgressBar({ status }: { status: ProcessingStage }) {
  const currentIndex = getStageIndex(status);
  if (currentIndex === -1) return null;

  const progress = Math.round(((currentIndex + 0.5) / PROCESSING_STAGES.length) * 100);

  return (
    <div className="flex items-center gap-2" data-testid="processing-progress-bar">
      <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
        <div className="absolute inset-0 animate-pulse rounded-full bg-primary/10" />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {currentIndex + 1}/{PROCESSING_STAGES.length}
      </span>
    </div>
  );
}

const PROCESSING_STATUSES: Set<string> = new Set(PROCESSING_STAGES.map((s) => s.key));

export function isProcessingStatus(status: string): status is ProcessingStage {
  return PROCESSING_STATUSES.has(status);
}
