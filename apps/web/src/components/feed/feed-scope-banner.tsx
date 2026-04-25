import type { Doc } from "@scrollect/backend/convex/_generated/dataModel";
import { BookOpen, Pencil, X } from "lucide-react";
import { useState } from "react";

import { EditTopicDialog } from "@/components/topics/edit-topic-dialog";
import { resolveTopicColor, resolveTopicIcon } from "@/components/topics/topic-appearance";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GOAL_PREVIEW_MAX = 140;

type FeedScopeBannerProps =
  | { scope: "topic"; topic: Doc<"topics">; onReset: () => void }
  | { scope: "document"; documentTitle: string; onReset: () => void };

export function FeedScopeBanner(props: FeedScopeBannerProps) {
  if (props.scope === "topic") {
    return <TopicScopeBanner topic={props.topic} onReset={props.onReset} />;
  }
  return <DocumentScopeBanner documentTitle={props.documentTitle} onReset={props.onReset} />;
}

function TopicScopeBanner({ topic, onReset }: { topic: Doc<"topics">; onReset: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const colorMeta = resolveTopicColor(topic.color);
  const { Icon } = resolveTopicIcon(topic.icon);
  const goal = truncate(topic.learningGoal, GOAL_PREVIEW_MAX);

  return (
    <div className="mt-6 px-4 md:px-6">
      <div
        data-testid="feed-scope-banner"
        data-scope="topic"
        className={cn(
          "relative flex flex-col gap-3 border border-border bg-card/60 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-5",
          "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
          colorMeta.bannerAccent,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
            colorMeta.accent,
          )}
        >
          <Icon className="size-4" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Ranking against
            </span>
            <span aria-hidden className="h-px flex-1 bg-border" />
          </div>
          <p className="font-logo text-base font-semibold leading-tight tracking-tight text-foreground">
            {topic.name}
          </p>
          {goal.length > 0 && (
            <p
              data-testid="feed-scope-banner-goal"
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {goal}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 self-start sm:self-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-none px-2 text-xs"
            onClick={() => setEditOpen(true)}
            data-testid="feed-scope-banner-edit"
          >
            <Pencil className="size-3.5" data-icon="inline-start" />
            Edit
          </Button>
          <span aria-hidden className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-none px-2 text-xs"
            onClick={onReset}
            data-testid="feed-view-all"
          >
            <X className="size-3.5" data-icon="inline-start" />
            View all
          </Button>
        </div>
      </div>

      <EditTopicDialog
        topicId={topic._id}
        initialName={topic.name}
        initialLearningGoal={topic.learningGoal}
        initialDescription={topic.description}
        initialColor={topic.color}
        initialIcon={topic.icon}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

function DocumentScopeBanner({
  documentTitle,
  onReset,
}: {
  documentTitle: string;
  onReset: () => void;
}) {
  return (
    <div className="mt-6 px-4 md:px-6">
      <div
        data-testid="feed-scope-banner"
        data-scope="document"
        className={cn(
          "relative flex flex-col gap-3 border border-border bg-card/60 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-5",
          "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary",
        )}
      >
        <span
          aria-hidden
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/5 text-primary"
        >
          <BookOpen className="size-4" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Scoped to
            </span>
            <span aria-hidden className="h-px flex-1 bg-border" />
          </div>
          <p className="line-clamp-2 font-logo text-base font-semibold leading-tight tracking-tight text-foreground">
            {documentTitle}
          </p>
        </div>

        <div className="shrink-0 self-start sm:self-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-none px-2 text-xs"
            onClick={onReset}
            data-testid="feed-view-all"
          >
            <X className="size-3.5" data-icon="inline-start" />
            View all
          </Button>
        </div>
      </div>
    </div>
  );
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}
