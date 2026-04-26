import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ArrowLeft, FileText, Layers, Loader2, Pencil, Rss, Trash2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { toast } from "sonner";

import { fileTypeIcons, StatusBadge, statusConfig } from "@/components/document-status";
import { NotFound } from "@/components/not-found";
import { EditTopicDialog } from "@/components/topics/edit-topic-dialog";
import { resolveTopicColor, resolveTopicIcon } from "@/components/topics/topic-appearance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { looksLikeConvexId } from "@/lib/convex-id";

export const Route = createFileRoute("/_authenticated/app/topics/$topicId")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Topic | Scrollect" }],
  }),
  notFoundComponent: () => (
    <NotFound>This topic doesn&apos;t exist or you don&apos;t have access to it.</NotFound>
  ),
  component: TopicDetailPage,
});

function TopicDetailPage() {
  const { topicId } = Route.useParams();
  const typedTopicId = topicId as Id<"topics">;
  const isMalformedTopicId = !looksLikeConvexId(topicId);
  const { data } = useQuery(
    convexQuery(
      api.topics.topics.getTopic,
      isMalformedTopicId ? "skip" : { topicId: typedTopicId },
    ),
  );
  const navigate = useNavigate();
  const deleteTopic = useMutation(api.topics.topics.deleteTopic);
  const posthog = usePostHog();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isMalformedTopicId || data === null) {
    return (
      <div
        data-testid="topic-unknown-state"
        className="mt-16 flex flex-col items-center gap-5 px-6 text-center"
      >
        <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
          <Layers className="size-8 text-primary/70" />
        </div>
        <div>
          <p className="font-logo text-2xl font-semibold tracking-tight">Unknown topic</p>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            This topic doesn&apos;t exist or you don&apos;t have access to it.
          </p>
        </div>
        <Button
          variant="outline"
          render={<Link to="/app/topics" />}
          data-testid="topic-unknown-back"
        >
          <ArrowLeft data-icon="inline-start" />
          Back to Topics
        </Button>
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="px-4 py-6 md:px-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-6 h-9 w-2/3 rounded" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    );
  }

  const { topic, documents } = data;
  const colorMeta = resolveTopicColor(topic.color);
  const { Icon } = resolveTopicIcon(topic.icon);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteTopic({ topicId: typedTopicId });
      posthog.capture("topic.deleted", { topic_id: typedTopicId });
      setDeleteOpen(false);
      toast.success("Topic deleted");
      await navigate({ to: "/app/topics" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete topic";
      posthog.captureException(error instanceof Error ? error : new Error(message));
      toast.error(message);
      setDeleting(false);
    }
  };

  return (
    <div className="px-4 py-6 md:px-6">
      <Link
        to="/app/topics"
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Topics
      </Link>

      <div className="mt-6 flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className={`mt-1 flex size-12 shrink-0 items-center justify-center rounded-lg border ${colorMeta.accent}`}
          >
            <Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-logo text-3xl font-semibold tracking-tight md:text-4xl">
              {topic.name}
            </h1>
            <p
              data-testid="topic-document-count"
              className="mt-1 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
            >
              {documents.length} document{documents.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Learning goal
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground">{topic.learningGoal}</p>
          {topic.description && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {topic.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="topic-open-feed-button"
            render={<Link to="/app/feed" search={{ topicId: typedTopicId }} />}
          >
            <Rss data-icon="inline-start" />
            Open feed for this topic
          </Button>
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
            data-testid="topic-edit-button"
          >
            <Pencil data-icon="inline-start" />
            Edit
          </Button>
          <AlertDialog
            open={deleteOpen}
            onOpenChange={(next) => {
              if (!deleting) setDeleteOpen(next);
            }}
          >
            <AlertDialogTrigger
              render={<Button variant="destructive" data-testid="topic-delete-button" />}
            >
              <Trash2 data-icon="inline-start" />
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete topic</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete &ldquo;{topic.name}&rdquo;? Documents will stay in your library, but this
                  topic and its document assignments will be removed. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleting}
                  onClick={handleDelete}
                  data-testid="topic-confirm-delete-button"
                >
                  {deleting && <Loader2 className="animate-spin" data-icon="inline-start" />}
                  Delete topic
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <EditTopicDialog
        topicId={typedTopicId}
        initialName={topic.name}
        initialLearningGoal={topic.learningGoal}
        initialDescription={topic.description}
        initialColor={topic.color}
        initialIcon={topic.icon}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <FileText className="size-3.5" />
          Documents
        </h2>
        {documents.length === 0 ? (
          <div
            data-testid="topic-no-documents"
            className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground"
          >
            No documents assigned yet. Open a document in your library and pick this topic.
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {documents.map((doc) => (
              <li key={doc._id}>
                <Link
                  to="/app/library/$documentId"
                  params={{ documentId: doc._id }}
                  data-testid="topic-document-link"
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <span className="shrink-0 text-muted-foreground [&_svg]:size-4">
                    {fileTypeIcons[doc.fileType] ?? <FileText className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {doc.title}
                  </span>
                  {doc.status in statusConfig && (
                    <StatusBadge status={doc.status as keyof typeof statusConfig} />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
