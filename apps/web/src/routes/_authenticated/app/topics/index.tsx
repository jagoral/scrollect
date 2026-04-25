import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Layers, Plus } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { CreateTopicDialog } from "@/components/topics/create-topic-dialog";
import { resolveTopicColor, resolveTopicIcon } from "@/components/topics/topic-appearance";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/app/topics/")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Topics | Scrollect" }],
  }),
  component: TopicsPage,
});

function TopicsPage() {
  const { data: topics } = useQuery(convexQuery(api.topics.topics.listTopics, {}));
  const [createOpen, setCreateOpen] = useState(false);

  const isLoading = topics === undefined;
  const hasTopics = topics !== undefined && topics.length > 0;

  return (
    <div className="pb-10">
      <PageHeader
        eyebrow="Knowledge Areas"
        title="Topics"
        description="Group documents by goal so Scrollect can shape posts around a focus."
        actions={
          <Button onClick={() => setCreateOpen(true)} data-testid="topics-create-button">
            <Plus className="size-4" data-icon="inline-start" />
            Create topic
          </Button>
        }
      />

      <CreateTopicDialog open={createOpen} onOpenChange={setCreateOpen} />

      {isLoading ? (
        <div className="grid gap-3 px-4 py-6 md:grid-cols-2 md:px-8 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : !hasTopics ? (
        <div
          data-testid="topics-empty-state"
          className="mt-16 flex flex-col items-center gap-5 px-6 text-center"
        >
          <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
            <Layers className="size-8 text-primary/70" />
          </div>
          <div>
            <p className="font-logo text-2xl font-semibold tracking-tight">No topics yet</p>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Create your first topic to focus your feed on a specific learning goal.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid="topics-create-empty-button">
            <Plus className="size-4" data-icon="inline-start" />
            Create your first topic
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 px-4 py-6 md:grid-cols-2 md:px-8 lg:grid-cols-3">
          {topics.map((topic) => {
            const colorMeta = resolveTopicColor(topic.color);
            const { Icon } = resolveTopicIcon(topic.icon);
            return (
              <Link
                key={topic._id}
                to="/app/topics/$topicId"
                params={{ topicId: topic._id }}
                data-testid="topic-card"
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/30"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex size-10 items-center justify-center rounded-lg border ${colorMeta.accent}`}
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-1 font-logo text-lg font-semibold tracking-tight">
                      {topic.name}
                    </h2>
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      {topic.documentCount} doc{topic.documentCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {topic.learningGoal}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
