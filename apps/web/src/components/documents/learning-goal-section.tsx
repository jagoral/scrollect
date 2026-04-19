import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useBlocker } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { GraduationCap, Loader2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 500;

type LearningGoalOnboardingStatus = "pending" | "set" | "skipped";

interface LearningGoalSectionProps {
  documentId: Id<"documents">;
  initialGoal?: string;
  onboardingStatus?: LearningGoalOnboardingStatus;
  sourceType?: string;
}

export function LearningGoalSection({
  documentId,
  initialGoal,
  onboardingStatus,
  sourceType,
}: LearningGoalSectionProps) {
  const [value, setValue] = useState(initialGoal ?? "");
  const [submitting, setSubmitting] = useState<"save" | "skip" | null>(null);
  const lastSavedValue = useRef(initialGoal ?? "");
  const isFocused = useRef(false);
  const updateLearningGoal = useMutation(api.content.documents.updateLearningGoal);
  const clearLearningGoal = useMutation(api.content.documents.clearLearningGoal);
  const skipLearningGoal = useMutation(api.content.documents.skipLearningGoalOnboarding);
  const posthog = usePostHog();
  const isOnboardingPending = onboardingStatus === "pending";
  const hasAppliedGoal = value.trim().length > 0;
  const stateLabel = isOnboardingPending
    ? "Waiting for choice"
    : hasAppliedGoal
      ? "Goal applied"
      : onboardingStatus === "skipped"
        ? "Unguided"
        : null;

  useEffect(() => {
    if (!isFocused.current) {
      const next = initialGoal ?? "";
      setValue(next);
      lastSavedValue.current = next;
    }
  }, [initialGoal]);

  const hasUnsavedChanges = value.trim() !== lastSavedValue.current;

  useBlocker({
    shouldBlockFn: () => hasUnsavedChanges,
  });

  const persistGoal = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed === lastSavedValue.current) return;

    setSubmitting("save");
    try {
      if (trimmed === "") {
        await clearLearningGoal({ id: documentId });
        lastSavedValue.current = "";
        setValue("");
        toast.success("Learning goal cleared");
      } else {
        await updateLearningGoal({ id: documentId, learningGoal: trimmed });
        if (isOnboardingPending) {
          posthog.capture("onboarding_goal_set", {
            document_id: documentId,
            source_type: sourceType,
            goal_kind: "freeform",
            preset_edited: false,
            preset_count: 0,
          });
        }
        lastSavedValue.current = trimmed;
        setValue(trimmed);
        toast.success("Learning goal saved");
      }
    } catch {
      toast.error("Failed to save learning goal");
    } finally {
      setSubmitting(null);
    }
  }, [
    value,
    documentId,
    updateLearningGoal,
    clearLearningGoal,
    isOnboardingPending,
    posthog,
    sourceType,
  ]);

  const handleBlur = useCallback(async () => {
    isFocused.current = false;
    await persistGoal();
  }, [persistGoal]);

  const handleSkip = useCallback(async () => {
    setSubmitting("skip");
    try {
      await skipLearningGoal({ id: documentId });
      lastSavedValue.current = "";
      setValue("");
      posthog.capture("onboarding_goal_skipped", {
        document_id: documentId,
        source_type: sourceType,
      });
      toast.success("No goal set. Scrollect will use a general learning path.");
    } catch {
      toast.error("Failed to skip learning goal");
    } finally {
      setSubmitting(null);
    }
  }, [documentId, posthog, skipLearningGoal, sourceType]);

  const charCount = value.length;

  return (
    <div data-testid="learning-goal-section" className="mt-6 border-t border-border pt-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <GraduationCap className="size-3.5" />
        Learning goal
        {stateLabel && (
          <Badge variant="secondary" className="ml-auto normal-case tracking-normal">
            {stateLabel}
          </Badge>
        )}
      </h2>
      {isOnboardingPending && (
        <p className="mb-3 text-sm text-muted-foreground">
          Card generation is waiting for your focus. Add a goal or skip for now so your feed can
          continue.
        </p>
      )}
      <Textarea
        data-testid="learning-goal-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => {
          isFocused.current = true;
        }}
        onBlur={isOnboardingPending ? undefined : handleBlur}
        placeholder="What do you want to learn from this document?"
        maxLength={MAX_LENGTH}
        aria-label="Learning goal"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <p className="min-h-4 text-xs text-muted-foreground">
          {value.length === 0
            ? "Try naming the outcome, context, or decision you want help with."
            : isOnboardingPending
              ? "This goal will shape the first cards generated for this document."
              : "Changes affect the next cards generated for this document."}
        </p>
        <span
          data-testid="learning-goal-char-count"
          className={cn("text-xs tabular-nums text-muted-foreground")}
        >
          {charCount}/{MAX_LENGTH}
        </span>
      </div>
      {isOnboardingPending && (
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            disabled={submitting !== null}
            data-testid="learning-goal-detail-skip"
          >
            {submitting === "skip" ? (
              <>
                <Loader2 className="animate-spin" data-icon="inline-start" />
                Skipping...
              </>
            ) : (
              "Skip for now"
            )}
          </Button>
          <Button
            type="button"
            onClick={persistGoal}
            disabled={submitting !== null || value.trim().length === 0}
            data-testid="learning-goal-detail-save"
          >
            {submitting === "save" ? (
              <>
                <Loader2 className="animate-spin" data-icon="inline-start" />
                Saving...
              </>
            ) : (
              "Save goal"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
