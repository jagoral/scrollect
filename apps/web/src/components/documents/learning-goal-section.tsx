import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useBlocker } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { GraduationCap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 500;

interface LearningGoalSectionProps {
  documentId: Id<"documents">;
  initialGoal?: string;
}

export function LearningGoalSection({ documentId, initialGoal }: LearningGoalSectionProps) {
  const [value, setValue] = useState(initialGoal ?? "");
  const lastSavedValue = useRef(initialGoal ?? "");
  const isFocused = useRef(false);
  const updateLearningGoal = useMutation(api.documents.updateLearningGoal);
  const clearLearningGoal = useMutation(api.documents.clearLearningGoal);

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

  const handleBlur = useCallback(async () => {
    isFocused.current = false;
    const trimmed = value.trim();
    if (trimmed === lastSavedValue.current) return;

    try {
      if (trimmed === "") {
        await clearLearningGoal({ id: documentId });
        lastSavedValue.current = "";
        setValue("");
        toast.success("Learning goal cleared");
      } else {
        await updateLearningGoal({ id: documentId, learningGoal: trimmed });
        lastSavedValue.current = trimmed;
        setValue(trimmed);
        toast.success("Learning goal saved");
      }
    } catch {
      toast.error("Failed to save learning goal");
    }
  }, [value, documentId, updateLearningGoal, clearLearningGoal]);

  const charCount = value.length;

  return (
    <div data-testid="learning-goal-section" className="mt-6 border-t border-border pt-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <GraduationCap className="size-3.5" />
        Learning goal
      </h2>
      <Textarea
        data-testid="learning-goal-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => {
          isFocused.current = true;
        }}
        onBlur={handleBlur}
        placeholder="What do you want to learn from this document?"
        maxLength={MAX_LENGTH}
        aria-label="Learning goal"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <p className="min-h-4 text-xs text-muted-foreground">
          {value.length === 0 ? "Tell Scrollect what to focus on when generating cards" : null}
        </p>
        <span
          data-testid="learning-goal-char-count"
          className={cn("text-xs tabular-nums text-muted-foreground")}
        >
          {charCount}/{MAX_LENGTH}
        </span>
      </div>
    </div>
  );
}
