import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { GraduationCap, Loader2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const MAX_LENGTH = 500;
const PRESETS = [
  "Understand the big picture",
  "Learn the key concepts",
  "Get practical techniques",
  "Build a mental model",
  "Prepare for an exam",
] as const;

type Preset = (typeof PRESETS)[number];

export type LearningGoalOnboardingPrompt = {
  documentId: Id<"documents">;
  documentTitle: string;
  sourceType: string;
};

type LearningGoalOnboardingDialogProps = {
  prompt: LearningGoalOnboardingPrompt | null;
  onComplete: () => void;
};

export function LearningGoalOnboardingDialog({
  prompt,
  onComplete,
}: LearningGoalOnboardingDialogProps) {
  const [goal, setGoal] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<Preset[]>([]);
  const [submitting, setSubmitting] = useState<"save" | "skip" | null>(null);
  const updateLearningGoal = useMutation(api.content.documents.updateLearningGoal);
  const skipLearningGoal = useMutation(api.content.documents.skipLearningGoalOnboarding);
  const posthog = usePostHog();

  const reset = useCallback(() => {
    setGoal("");
    setSelectedPresets([]);
    setSubmitting(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onComplete();
  }, [onComplete, reset]);

  const handlePresetChange = useCallback((next: Preset[]) => {
    setSelectedPresets(next);
    setGoal(next.join(", "));
  }, []);

  const handleSave = useCallback(async () => {
    if (!prompt) return;
    const trimmed = goal.trim();
    if (!trimmed) {
      toast.error("Add a goal or skip this step.");
      return;
    }

    setSubmitting("save");
    try {
      await updateLearningGoal({ id: prompt.documentId, learningGoal: trimmed });
      const presetText = selectedPresets.join(", ");
      posthog.capture("onboarding_goal_set", {
        document_id: prompt.documentId,
        source_type: prompt.sourceType,
        goal_kind: selectedPresets.length > 0 ? "preset" : "freeform",
        preset_edited: selectedPresets.length > 0 && trimmed !== presetText,
        preset_count: selectedPresets.length,
      });
      toast.success("Goal saved. It will shape the posts generated for this document.");
      close();
    } catch (error) {
      posthog.captureException(error);
      toast.error("Failed to save learning goal");
      setSubmitting(null);
    }
  }, [close, goal, posthog, prompt, selectedPresets, updateLearningGoal]);

  const handleSkip = useCallback(async () => {
    if (!prompt) return;
    setSubmitting("skip");
    try {
      await skipLearningGoal({ id: prompt.documentId });
      posthog.capture("onboarding_goal_skipped", {
        document_id: prompt.documentId,
        source_type: prompt.sourceType,
      });
      toast.success("No goal set. Scrollect will use a general learning path.");
      close();
    } catch (error) {
      posthog.captureException(error);
      toast.error("Failed to skip learning goal");
      setSubmitting(null);
    }
  }, [close, posthog, prompt, skipLearningGoal]);

  const disabled = submitting !== null;

  return (
    <Dialog open={prompt !== null}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center border border-border text-muted-foreground">
            <GraduationCap />
          </div>
          <DialogTitle>What do you want to learn from this?</DialogTitle>
          <DialogDescription>
            {prompt ? (
              <>
                A specific goal helps Scrollect focus posts for{" "}
                <span className="font-medium text-foreground">{prompt.documentTitle}</span>. You can
                change it later.
              </>
            ) : (
              "A specific goal helps Scrollect focus the posts. You can change it later."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Post generation waits for <span className="font-medium text-foreground">Save goal</span>{" "}
            or <span className="font-medium text-foreground">Skip for now</span>. Parsing and
            chunking continue in the background.
          </div>

          <ToggleGroup
            multiple
            value={selectedPresets}
            onValueChange={(next) => handlePresetChange(next as Preset[])}
            variant="outline"
            spacing={2}
            className="flex-wrap"
            disabled={disabled}
            aria-label="Learning goal presets"
          >
            {PRESETS.map((preset) => (
              <ToggleGroupItem
                key={preset}
                value={preset}
                data-testid={`learning-goal-preset-${preset.toLowerCase().replaceAll(" ", "-")}`}
              >
                {preset}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="flex flex-col gap-2">
            <Textarea
              data-testid="onboarding-learning-goal-textarea"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              maxLength={MAX_LENGTH}
              disabled={disabled}
              placeholder="I want practical takeaways I can apply this week, with examples and common mistakes to avoid."
              aria-label="Learning goal"
              rows={5}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Name the outcome, context, or decision you want help with.</span>
              <span data-testid="onboarding-learning-goal-char-count">
                {goal.length}/{MAX_LENGTH}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            disabled={disabled}
            data-testid="learning-goal-skip"
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
            onClick={handleSave}
            disabled={disabled || goal.trim().length === 0}
            data-testid="learning-goal-save"
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
