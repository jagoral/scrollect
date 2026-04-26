import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  TOPIC_COLORS,
  TOPIC_ICONS,
  resolveTopicColor,
  resolveTopicIcon,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const NAME_MAX_LENGTH = 80;
const GOAL_MAX_LENGTH = 500;
const DESCRIPTION_MAX_LENGTH = 1000;

interface EditTopicDialogProps {
  topicId: Id<"topics">;
  initialName: string;
  initialLearningGoal: string;
  initialDescription?: string;
  initialColor?: string;
  initialIcon?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTopicDialog(props: EditTopicDialogProps) {
  const { open, onOpenChange, topicId } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <EditTopicDialogBody key={topicId} {...props} />
    </Dialog>
  );
}

function EditTopicDialogBody({
  topicId,
  initialName,
  initialLearningGoal,
  initialDescription,
  initialColor,
  initialIcon,
  onOpenChange,
}: EditTopicDialogProps) {
  const updateTopic = useMutation(api.topics.topics.updateTopic);
  const posthog = usePostHog();

  const [name, setName] = useState(initialName);
  const [learningGoal, setLearningGoal] = useState(initialLearningGoal);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [color, setColor] = useState<TopicColorKey>(() => resolveTopicColor(initialColor).key);
  const [icon, setIcon] = useState<TopicIconKey>(() => resolveTopicIcon(initialIcon).key);
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  const trimmedGoal = learningGoal.trim();
  const canSubmit = trimmedName.length > 0 && trimmedGoal.length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const trimmedDescription = description.trim();
      const goalChanged = trimmedGoal !== initialLearningGoal;
      const initialColorKey = resolveTopicColor(initialColor).key;
      const initialIconKey = resolveTopicIcon(initialIcon).key;
      await updateTopic({
        topicId,
        name: trimmedName !== initialName ? trimmedName : undefined,
        learningGoal: goalChanged ? trimmedGoal : undefined,
        description:
          trimmedDescription !== (initialDescription ?? "") ? trimmedDescription : undefined,
        color: color !== initialColorKey ? color : undefined,
        icon: icon !== initialIconKey ? icon : undefined,
      });
      posthog.capture("topic.updated", {
        topic_id: topicId,
        goal_changed: goalChanged,
      });
      toast.success("Topic updated");
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update topic";
      posthog.captureException(error instanceof Error ? error : new Error(message));
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    color,
    description,
    icon,
    initialColor,
    initialDescription,
    initialIcon,
    initialLearningGoal,
    initialName,
    onOpenChange,
    posthog,
    topicId,
    trimmedGoal,
    trimmedName,
    updateTopic,
  ]);

  return (
    <DialogContent className="sm:max-w-lg" data-testid="edit-topic-dialog">
      <DialogHeader>
        <DialogTitle>Edit topic</DialogTitle>
        <DialogDescription>
          Editing the goal re-embeds it and shapes the next posts generated for this topic.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-topic-name">Name</Label>
          <Input
            id="edit-topic-name"
            data-testid="edit-topic-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            disabled={submitting}
            className="h-10"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-topic-learning-goal">Learning goal</Label>
          <Textarea
            id="edit-topic-learning-goal"
            data-testid="edit-topic-learning-goal-input"
            value={learningGoal}
            onChange={(e) => setLearningGoal(e.target.value)}
            maxLength={GOAL_MAX_LENGTH}
            disabled={submitting}
            rows={4}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Changing the goal re-embeds it on the server.</span>
            <span data-testid="edit-topic-learning-goal-char-count">
              {learningGoal.length}/{GOAL_MAX_LENGTH}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-topic-description">Description (optional)</Label>
          <Textarea
            id="edit-topic-description"
            data-testid="edit-topic-description-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX_LENGTH}
            disabled={submitting}
            rows={2}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Color</Label>
          <RadioGroup
            value={color}
            onValueChange={(next: string) => setColor(next as TopicColorKey)}
            aria-label="Topic color"
            disabled={submitting}
            className="flex w-fit flex-wrap gap-2"
          >
            {TOPIC_COLORS.map((option) => (
              <RadioGroupItem
                key={option.key}
                value={option.key}
                unstyled
                aria-label={option.label}
                data-testid={`topic-color-${option.key}`}
                className={cn(
                  "size-7 shrink-0 rounded-full border-2 border-transparent transition-all",
                  option.swatch,
                  "hover:scale-105",
                  "data-checked:border-foreground data-checked:scale-110",
                )}
              />
            ))}
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Icon</Label>
          <RadioGroup
            value={icon}
            onValueChange={(next: string) => setIcon(next as TopicIconKey)}
            aria-label="Topic icon"
            disabled={submitting}
            className="flex w-fit flex-wrap gap-2"
          >
            {TOPIC_ICONS.map(({ key, label, Icon }) => (
              <RadioGroupItem
                key={key}
                value={key}
                unstyled
                aria-label={label}
                data-testid={`topic-icon-${key}`}
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors",
                  "hover:text-foreground",
                  "data-checked:border-foreground data-checked:bg-accent data-checked:text-accent-foreground",
                )}
              >
                <Icon className="size-4" />
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="topic-save-button"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Saving...
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
