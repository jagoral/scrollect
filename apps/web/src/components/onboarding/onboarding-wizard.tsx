import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Doc } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery } from "convex/react";
import { ArrowRight, Check, FileText, Globe, Loader2, Sparkles, Upload } from "lucide-react";
import { useEffect, useRef } from "react";

import { DETAIL_RULED_BG_STYLE } from "@/components/detail-rail";
import {
  ProcessingProgressBar,
  isProcessingStatus,
} from "@/components/documents/processing-progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OnboardingStage = "welcome" | "processing" | "ready";

type OnboardingDocument = Doc<"documents">;

function resolveStage({
  documents,
  hasFirstPost,
}: {
  documents: OnboardingDocument[];
  hasFirstPost: boolean;
}): OnboardingStage {
  if (hasFirstPost) return "ready";
  if (documents.length > 0) return "processing";
  return "welcome";
}

const STEPS: ReadonlyArray<{ key: OnboardingStage; label: string }> = [
  { key: "welcome", label: "Add content" },
  { key: "processing", label: "AI extracts posts" },
  { key: "ready", label: "Scroll your feed" },
];

export function OnboardingWizard({ documents }: { documents: OnboardingDocument[] }) {
  const { data: profile } = useQuery(convexQuery(api.access.entitlements.getUserProfile, {}));
  const markCompleted = useMutation(api.access.entitlements.markOnboardingCompleted);

  const firstPostQuery = usePaginatedQuery(api.feed.queries.list, {}, { initialNumItems: 1 });
  const hasFirstPost = firstPostQuery.results.length > 0;
  const stage = resolveStage({ documents, hasFirstPost });
  const stageIndex = STEPS.findIndex((s) => s.key === stage);

  const markedRef = useRef(false);
  useEffect(() => {
    if (markedRef.current) return;
    if (stage === "ready" && profile && !profile.onboardingCompleted) {
      markedRef.current = true;
      void markCompleted();
    }
  }, [stage, profile, markCompleted]);

  if (!profile || profile.onboardingCompleted) return null;

  const progress = ((stageIndex + 1) / STEPS.length) * 100;
  const currentStep = STEPS[stageIndex];

  return (
    <section
      data-testid="onboarding-wizard"
      className="mx-4 mb-10 border border-border bg-card md:mx-6"
    >
      <div className="flex items-center gap-4 px-5 pt-4 pb-3 md:px-6">
        <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
          <span className="text-foreground tabular-nums">
            {String(stageIndex + 1).padStart(2, "0")}
          </span>
          <span className="text-muted-foreground/50"> / 0{STEPS.length}</span>
          <span className="mx-2 text-muted-foreground/30">·</span>
          <span className="text-foreground normal-case tracking-normal">{currentStep.label}</span>
        </span>
        <div
          className="relative h-[2px] flex-1 overflow-hidden bg-border/60"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 transition-[width] duration-500 ease-out",
              stage === "ready" ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${progress}%` }}
          />
          {STEPS.map((_, i) => {
            if (i === 0) return null;
            const pct = (i / STEPS.length) * 100;
            return (
              <span
                key={i}
                aria-hidden
                className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card ring-1 ring-border"
                style={{ left: `${pct}%` }}
              />
            );
          })}
        </div>
      </div>

      <div
        className="border-t border-border px-6 py-10 md:px-10 md:py-12"
        style={DETAIL_RULED_BG_STYLE}
      >
        {stage === "welcome" && <WelcomeStage />}
        {stage === "processing" && <ProcessingStage documents={documents} />}
        {stage === "ready" && <ReadyStage />}
      </div>
    </section>
  );
}

function WelcomeStage() {
  return (
    <div className="flex flex-col items-start gap-6">
      <span className="inline-flex items-center gap-2 border border-primary/40 bg-primary/5 px-3 py-1 font-mono text-[10px] font-medium tracking-[0.22em] text-primary uppercase">
        <Sparkles className="size-3" />
        Welcome to Scrollect
      </span>
      <h2 className="font-logo text-[2rem] font-semibold leading-[1.05] tracking-tight text-balance md:text-[2.6rem]">
        Let&rsquo;s turn something you&rsquo;ve read
        <br className="hidden sm:block" />
        into posts you&rsquo;ll remember.
      </h2>
      <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
        Add any PDF, article, YouTube video, or note. In about a minute you&rsquo;ll have a personal
        feed of insights, quotes, and quizzes drawn from it.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="lg" render={<Link to="/app/upload" />}>
          <Upload className="size-4" />
          Upload a file
        </Button>
        <Button size="lg" variant="outline" render={<Link to="/app/upload" />}>
          <Globe className="size-4" />
          Paste a URL
        </Button>
        <Button size="lg" variant="ghost" render={<Link to="/app/upload" />}>
          <FileText className="size-4" />
          Paste text
        </Button>
      </div>
    </div>
  );
}

function ProcessingStage({ documents }: { documents: OnboardingDocument[] }) {
  const processing = documents.filter((d) => isProcessingStatus(d.status));
  const active = processing[0] ?? documents[0];

  return (
    <div className="flex flex-col gap-6">
      <span className="inline-flex items-center gap-2 border border-primary/40 bg-primary/5 px-3 py-1 font-mono text-[10px] font-medium tracking-[0.22em] text-primary uppercase">
        <Loader2 className="size-3 animate-spin" />
        Working on it
      </span>

      <div className="max-w-xl">
        <h2 className="font-logo text-[1.85rem] font-semibold leading-[1.08] tracking-tight text-balance md:text-[2.2rem]">
          Generating your first posts.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          This usually takes a minute or three. Stay here to watch, or come back later - we&rsquo;ll
          keep working while you&rsquo;re away.
        </p>
      </div>

      {active && (
        <div className="relative border border-border bg-background/80 px-5 py-4 backdrop-blur">
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-[2px]",
              isProcessingStatus(active.status) ? "bg-primary" : "bg-muted-foreground/40",
            )}
          />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Now processing
              </p>
              <p className="mt-1.5 line-clamp-1 font-logo text-[17px] font-medium leading-tight">
                {active.title}
              </p>
            </div>
            {isProcessingStatus(active.status) ? (
              <ProcessingProgressBar status={active.status} />
            ) : (
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {active.status}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadyStage() {
  return (
    <div className="flex flex-col items-start gap-5">
      <span className="inline-flex items-center gap-2 border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 font-mono text-[10px] font-medium tracking-[0.22em] text-emerald-600 uppercase dark:text-emerald-400">
        <Check className="size-3" strokeWidth={3} />
        First posts ready
      </span>
      <h2 className="font-logo text-[2rem] font-semibold leading-[1.05] tracking-tight text-balance md:text-[2.6rem]">
        The good part.
        <br className="hidden sm:block" />
        Scroll your first feed.
      </h2>
      <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
        Your posts are waiting. React to shape what comes next - Scrollect learns from every tap.
      </p>
      <Button size="lg" render={<Link to="/app/feed" />}>
        Open the feed
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
