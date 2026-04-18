import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Doc } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery } from "convex/react";
import { ArrowRight, CheckCircle2, FileText, Globe, Loader2, Sparkles, Upload } from "lucide-react";
import { useEffect, useRef } from "react";

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

const steps: ReadonlyArray<{ key: OnboardingStage; label: string }> = [
  { key: "welcome", label: "Add content" },
  { key: "processing", label: "AI generates cards" },
  { key: "ready", label: "Scroll your feed" },
];

export function OnboardingWizard({ documents }: { documents: OnboardingDocument[] }) {
  const { data: profile } = useQuery(convexQuery(api.entitlements.getUserProfile, {}));
  const markCompleted = useMutation(api.entitlements.markOnboardingCompleted);

  const firstPostQuery = usePaginatedQuery(api.feed.queries.list, {}, { initialNumItems: 1 });
  const hasFirstPost = firstPostQuery.results.length > 0;
  const stage = resolveStage({ documents, hasFirstPost });

  const markedRef = useRef(false);
  useEffect(() => {
    if (markedRef.current) return;
    if (stage === "ready" && profile && !profile.onboardingCompleted) {
      markedRef.current = true;
      void markCompleted();
    }
  }, [stage, profile, markCompleted]);

  if (!profile || profile.onboardingCompleted) return null;

  return (
    <div className="mx-4 md:mx-6 mb-8 border border-border bg-card">
      <div className="grid gap-0 border-b border-border md:grid-cols-3">
        {steps.map((step, i) => {
          const reached = steps.findIndex((s) => s.key === stage) >= i;
          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center gap-3 px-5 py-3 text-sm",
                i > 0 && "border-t border-border md:border-t-0 md:border-l",
                reached ? "text-foreground" : "text-muted-foreground/70",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center border font-mono text-xs",
                  reached
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <span className={cn(reached ? "font-medium" : "")}>{step.label}</span>
            </div>
          );
        })}
      </div>

      <div className="px-6 py-8 md:px-10 md:py-10">
        {stage === "welcome" && <WelcomeStage />}
        {stage === "processing" && <ProcessingStage documents={documents} />}
        {stage === "ready" && <ReadyStage />}
      </div>
    </div>
  );
}

function WelcomeStage() {
  return (
    <div className="flex flex-col items-start gap-6">
      <div className="inline-flex items-center gap-2 border border-primary/40 bg-primary/5 px-3 py-1 text-[10px] font-medium tracking-[0.15em] text-primary uppercase">
        <Sparkles className="size-3" />
        Welcome to Scrollect
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          Let's turn something you've read into cards you'll remember.
        </h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Add any PDF, article, YouTube video, or note. In about a minute you'll have a personal
          feed of insights, quotes, and quizzes drawn from it.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" render={<Link to="/app/upload" />}>
          <Upload className="size-4" />
          Upload a file
        </Button>
        <Button size="lg" variant="outline" render={<Link to="/app/upload" />}>
          <Globe className="size-4" />
          Paste a URL
        </Button>
        <Button size="lg" variant="outline" render={<Link to="/app/upload" />}>
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
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center border border-primary/40 bg-primary/5 text-primary">
          <Loader2 className="size-5 animate-spin" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">Generating your first cards</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This typically takes 1-3 minutes. You can stay here or come back later - we'll keep
            working in the background.
          </p>
        </div>
      </div>

      {active && (
        <div className="border border-border border-l-[2px] border-l-primary bg-background px-5 py-4">
          <p className="line-clamp-1 text-sm font-semibold">{active.title}</p>
          <div className="mt-2 flex items-center gap-3">
            {isProcessingStatus(active.status) ? (
              <ProcessingProgressBar status={active.status} />
            ) : (
              <span className="text-xs text-muted-foreground">{active.status}</span>
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
      <div className="inline-flex items-center gap-2 border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-[10px] font-medium tracking-[0.15em] text-emerald-600 uppercase dark:text-emerald-400">
        <CheckCircle2 className="size-3" />
        Your first cards are ready
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          The good part. Scroll your first feed.
        </h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Your cards are waiting in the feed. React to shape what you see next - Scrollect learns as
          you go.
        </p>
      </div>
      <Button size="lg" render={<Link to="/app/feed" />}>
        Open the feed
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
