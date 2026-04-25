import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Check, ChevronsUpDown, Layers, Plus } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { toast } from "sonner";

import { CreateTopicDialog } from "@/components/topics/create-topic-dialog";
import { resolveTopicColor, resolveTopicIcon } from "@/components/topics/topic-appearance";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TopicAssignmentSectionProps {
  documentId: Id<"documents">;
}

export function TopicAssignmentSection({ documentId }: TopicAssignmentSectionProps) {
  const { data: topics } = useQuery(convexQuery(api.topics.topics.listTopics, {}));
  const { data: currentTopic } = useQuery(
    convexQuery(api.topics.topics.getDocumentTopic, { documentId }),
  );
  const assignDocumentToTopic = useMutation(api.topics.topics.assignDocumentToTopic);
  const removeDocumentFromTopic = useMutation(api.topics.topics.removeDocumentFromTopic);
  const posthog = usePostHog();

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  if (topics === undefined || currentTopic === undefined) {
    return (
      <div
        data-testid="topic-assignment-section-loading"
        className="mt-6 border-t border-border pt-5"
      >
        <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Layers className="size-3.5" />
          Topic
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-48" />
        </div>
      </div>
    );
  }

  const handleSelectTopic = async (topicId: Id<"topics">) => {
    setOpen(false);
    try {
      await assignDocumentToTopic({ documentId, topicId });
      posthog.capture("document.assigned_to_topic", {
        topic_id: topicId,
        document_id: documentId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to assign topic";
      posthog.captureException(error instanceof Error ? error : new Error(message));
      toast.error(message);
    }
  };

  const handleClearTopic = async () => {
    setOpen(false);
    if (!currentTopic) return;
    try {
      await removeDocumentFromTopic({ documentId, topicId: currentTopic._id });
      posthog.capture("document.removed_from_topic", {
        topic_id: currentTopic._id,
        document_id: documentId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove topic";
      posthog.captureException(error instanceof Error ? error : new Error(message));
      toast.error(message);
    }
  };

  const handleTopicCreated = async (topicId: Id<"topics">) => {
    try {
      await assignDocumentToTopic({ documentId, topicId });
      posthog.capture("document.assigned_to_topic", {
        topic_id: topicId,
        document_id: documentId,
        from_inline_create: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to assign new topic";
      posthog.captureException(error instanceof Error ? error : new Error(message));
      toast.error(message);
    }
  };

  const triggerLabel = currentTopic ? currentTopic.name : "No topic";
  const triggerColor = currentTopic ? resolveTopicColor(currentTopic.color) : null;
  const TriggerIcon = currentTopic ? resolveTopicIcon(currentTopic.icon).Icon : Layers;

  return (
    <div data-testid="topic-assignment-section" className="mt-6 border-t border-border pt-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Layers className="size-3.5" />
        Topic
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                data-testid="topic-picker-trigger"
                aria-expanded={open}
                aria-haspopup="listbox"
                className="min-w-48 justify-between gap-2"
              />
            }
          >
            <span className="flex items-center gap-2 truncate">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded border",
                  triggerColor?.accent ?? "border-border text-muted-foreground",
                )}
                aria-hidden
              >
                <TriggerIcon className="size-3" />
              </span>
              <span className="truncate">{triggerLabel}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search topics..." data-testid="topic-search-input" />
              <CommandList>
                <CommandEmpty>No topics found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__no_topic__"
                    data-testid="topic-option-none"
                    onSelect={handleClearTopic}
                    disabled={!currentTopic}
                  >
                    <span className="flex size-5 items-center justify-center rounded border border-border text-muted-foreground">
                      <Layers className="size-3" />
                    </span>
                    <span className="flex-1">No topic</span>
                    {!currentTopic && <Check className="size-3.5 text-primary" />}
                  </CommandItem>
                </CommandGroup>
                {topics.length > 0 && (
                  <CommandGroup heading="Your topics">
                    {topics.map((topic) => {
                      const colorMeta = resolveTopicColor(topic.color);
                      const { Icon } = resolveTopicIcon(topic.icon);
                      const selected = currentTopic?._id === topic._id;
                      return (
                        <CommandItem
                          key={topic._id}
                          value={topic.name}
                          data-testid={`topic-option-${topic._id}`}
                          onSelect={() => handleSelectTopic(topic._id)}
                        >
                          <span
                            className={cn(
                              "flex size-5 items-center justify-center rounded border",
                              colorMeta.accent,
                            )}
                            aria-hidden
                          >
                            <Icon className="size-3" />
                          </span>
                          <span className="flex-1 truncate">{topic.name}</span>
                          {selected && <Check className="size-3.5 text-primary" />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
                <CommandGroup>
                  <CommandItem
                    value="__create_topic__"
                    data-testid="topic-option-create"
                    onSelect={() => {
                      setOpen(false);
                      setCreateOpen(true);
                    }}
                  >
                    <Plus className="size-3.5 text-muted-foreground" />
                    <span>Create new topic...</span>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {currentTopic && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="topic-open-link"
            render={<Link to="/app/topics/$topicId" params={{ topicId: currentTopic._id }} />}
          >
            View topic
          </Button>
        )}

        {topics.length === 0 && !currentTopic && (
          <span className="text-xs text-muted-foreground">
            No topics yet. Create one to focus this document.
          </span>
        )}
      </div>

      <CreateTopicDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleTopicCreated}
      />
    </div>
  );
}
