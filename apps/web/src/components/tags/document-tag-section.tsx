"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Tag } from "lucide-react";
import { toast } from "sonner";

import { TagBadge } from "./tag-badge";
import { TagCombobox } from "./tag-combobox";
import type { DocumentTag } from "./types";

interface DocumentTagSectionProps {
  documentId: Id<"documents">;
}

export function DocumentTagSection({ documentId }: DocumentTagSectionProps) {
  const documentTags = useQuery(api.tags.getDocumentTags, { documentId });
  const allUserTags = useQuery(api.tags.listUserTags);

  const addTag = useMutation(api.tags.addTagToDocument).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.tags.getDocumentTags, {
      documentId: args.documentId,
    });
    if (current === undefined) return;
    const alreadyExists = current.some((t) => t.name.toLowerCase() === args.name.toLowerCase());
    if (alreadyExists) return;
    localStore.setQuery(api.tags.getDocumentTags, { documentId: args.documentId }, [
      ...current,
      {
        _id: `optimistic_${Date.now()}` as Id<"tags">,
        _creationTime: Date.now(),
        name: args.name,
        normalizedName: args.name.toLowerCase(),
        userId: "",
        createdAt: Date.now(),
        source: "manual" as const,
      },
    ]);
  });

  const removeTag = useMutation(api.tags.removeTagFromDocument).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.tags.getDocumentTags, {
        documentId: args.documentId,
      });
      if (current === undefined) return;
      localStore.setQuery(
        api.tags.getDocumentTags,
        { documentId: args.documentId },
        current.filter((t) => t._id !== args.tagId),
      );
    },
  );

  if (documentTags === undefined || allUserTags === undefined) {
    return null;
  }

  const tags: DocumentTag[] = documentTags.map((t) => ({
    tagId: t._id,
    tagName: t.name,
    source: t.source,
  }));

  const sortedTags = [...tags].sort((a, b) => a.tagName.localeCompare(b.tagName));
  const assignedTagNames = new Set(tags.map((t) => t.tagName));
  const tagOptions = allUserTags.map((t) => ({ _id: t._id, name: t.name }));

  const handleAddTag = (tagName: string) => {
    addTag({ documentId, name: tagName }).catch(() => {
      toast.error("Failed to add tag");
    });
  };

  const handleRemoveTag = (tag: DocumentTag) => {
    removeTag({ documentId, tagId: tag.tagId as Id<"tags"> }).catch(() => {
      toast.error("Failed to remove tag");
    });
  };

  return (
    <div data-testid="document-tag-section" className="mt-6 border-t border-border/40 pt-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Tag className="size-3.5" />
        Tags
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        {sortedTags.map((tag) => (
          <TagBadge key={tag.tagId} tag={tag} onRemove={handleRemoveTag} />
        ))}
        <TagCombobox
          existingTags={tagOptions}
          assignedTagNames={assignedTagNames}
          currentTagCount={tags.length}
          onSelect={handleAddTag}
          onCreate={handleAddTag}
        />
      </div>
    </div>
  );
}
