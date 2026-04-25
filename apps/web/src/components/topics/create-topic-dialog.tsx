import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  DEFAULT_TOPIC_COLOR,
  DEFAULT_TOPIC_ICON,
  TOPIC_COLORS,
  TOPIC_ICONS,
  type TopicColorKey,
  type TopicIconKey,
} from "@/components/topics/topic-appearance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const NAME_MAX_LENGTH = 80;
const GOAL_MAX_LENGTH = 500;
const DESCRIPTION_MAX_LENGTH = 1000;

interface CreateTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (topicId: Id<"topics">) => void;
  initialName?: string;
}

export function CreateTopicDialog({
  open,
  onOpenChange,
  onCreated,
  initialName,
}: CreateTopicDialogProps) {
  const [name, setName] = useState(initialName ?? "");
  const [learningGoal, setLearningGoal] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<TopicColorKey>(DEFAULT_TOPIC_COLOR);
  const [icon, setIcon] = useState<TopicIconKey>(DEFAULT_TOPIC_ICON);
  const [submitting, setSubmitting] = useState(false);
  const createTopic = useMutation(api.topics.topics.createTopic);
  const posthog = usePostHog();
  const navigate = useNavigate();
  const shouldNavigateOnCreate = onCreated === undefined;

  const reset = useCallback(() => {
    setName(initialName ?? "");
    setLearningGoal("");
    setDescription("");
    setColor(DEFAULT_TOPIC_COLOR);
    setIcon(DEFAULT_TOPIC_ICON);
    setSubmitting(false);
  }, [initialName]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (submitting) return;
      onOpenChange(next);
      if (!next) reset();
    },
    [onOpenChange, reset, submitting],
  );

  const trimmedName = name.trim();
  const trimmedGoal = learningGoal.trim();
  const canSubmit = trimmedName.length > 0 && trimmedGoal.length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    let createdTopicId: Id<"topics"> | null = null;
    try {
      const trimmedDescription = description.trim();
      createdTopicId = await createTopic({
        name: trimmedName,
        learningGoal: trimmedGoal,
        description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
        color,
        icon,
      });
      posthog.capture("topic.created", {
        has_description: trimmedDescription.length > 0,
      });
      toast.success("Topic created");
      onCreated?.(createdTopicId);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create topic";
      posthog.captureException(error instanceof Error ? error : new Error(message));
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
    if (createdTopicId && shouldNavigateOnCreate) {
      await navigate({ to: "/app/topics/$topicId", params: { topicId: createdTopicId } });
    }
  }, [
    canSubmit,
    color,
    createTopic,
    description,
    icon,
    navigate,
    onCreated,
    onOpenChange,
    posthog,
    shouldNavigateOnCreate,
    trimmedGoal,
    trimmedName,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="create-topic-dialog">
        <DialogHeader>
          <DialogTitle>Create a topic</DialogTitle>
          <DialogDescription>
            Topics group your documents around a goal. Scrollect biases generated posts toward this
            goal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="topic-name">Name</Label>
            <Input
              id="topic-name"
              data-testid="topic-name-input"
              placeholder="e.g., Distributed Systems"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX_LENGTH}
              disabled={submitting}
              className="h-10"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="topic-learning-goal">Learning goal</Label>
            <Textarea
              id="topic-learning-goal"
              data-testid="topic-learning-goal-input"
              placeholder="What do you want to learn from documents in this topic?"
              value={learningGoal}
              onChange={(e) => setLearningGoal(e.target.value)}
              maxLength={GOAL_MAX_LENGTH}
              disabled={submitting}
              rows={4}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Name the outcome, decision, or context you want help with.</span>
              <span data-testid="topic-learning-goal-char-count">
                {learningGoal.length}/{GOAL_MAX_LENGTH}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="topic-description">Description (optional)</Label>
            <Textarea
              id="topic-description"
              data-testid="topic-description-input"
              placeholder="A short note for yourself."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX_LENGTH}
              disabled={submitting}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Topic color">
              {TOPIC_COLORS.map((option) => {
                const selected = option.key === color;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={option.label}
                    data-testid={`topic-color-${option.key}`}
                    onClick={() => setColor(option.key)}
                    disabled={submitting}
                    className={cn(
                      "size-7 rounded-full border-2 transition-all",
                      option.swatch,
                      selected
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105",
                    )}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Topic icon">
              {TOPIC_ICONS.map(({ key, label, Icon }) => {
                const selected = key === icon;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    data-testid={`topic-icon-${key}`}
                    onClick={() => setIcon(key)}
                    disabled={submitting}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md border transition-colors",
                      selected
                        ? "border-foreground bg-accent text-accent-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
            data-testid="topic-cancel-button"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="topic-create-button"
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" data-icon="inline-start" />
                Creating...
              </>
            ) : (
              "Create topic"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
