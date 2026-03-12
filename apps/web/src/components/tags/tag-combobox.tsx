"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

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

const MAX_TAGS_PER_DOCUMENT = 20;
const MAX_TAG_NAME_LENGTH = 50;

interface TagOption {
  _id: string;
  name: string;
}

interface TagComboboxProps {
  existingTags: TagOption[];
  assignedTagNames: Set<string>;
  currentTagCount: number;
  onSelect: (tagName: string) => void;
  onCreate: (tagName: string) => void;
}

export function TagCombobox({
  existingTags,
  assignedTagNames,
  currentTagCount,
  onSelect,
  onCreate,
}: TagComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  if (currentTagCount >= MAX_TAGS_PER_DOCUMENT) {
    return (
      <p
        data-testid="tag-limit-message"
        className="rounded-md bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
      >
        Maximum tags reached ({MAX_TAGS_PER_DOCUMENT}). Remove a tag to add more.
      </p>
    );
  }

  const filtered = existingTags.filter((t) => !assignedTagNames.has(t.name));

  const trimmed = search.trim().toLowerCase();
  const exactMatch = existingTags.some((t) => t.name.toLowerCase() === trimmed);
  const tooLong = trimmed.length > MAX_TAG_NAME_LENGTH;
  const showCreate = trimmed.length > 0 && !exactMatch && !tooLong;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            data-testid="add-tag-button"
            className="h-7 gap-1 border-dashed text-xs text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Plus className="size-3.5" />
        Add tag
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="Search or create tag..."
            value={search}
            onValueChange={setSearch}
            data-testid="tag-search-input"
          />
          <CommandList>
            <CommandEmpty>
              {tooLong ? (
                <span data-testid="tag-name-too-long" className="text-destructive">
                  Tag name must be {MAX_TAG_NAME_LENGTH} characters or fewer.
                </span>
              ) : showCreate ? null : (
                "No tags found."
              )}
            </CommandEmpty>
            {showCreate && (
              <CommandGroup>
                <CommandItem
                  data-testid="create-tag-option"
                  onSelect={() => {
                    onCreate(search.trim());
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <Plus className="size-3.5 text-muted-foreground" />
                  Create {"\u201C"}
                  {search.trim()}
                  {"\u201D"}
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.length > 0 && (
              <CommandGroup heading="Existing tags">
                {filtered.map((tag) => (
                  <CommandItem
                    key={tag._id}
                    value={tag.name}
                    data-testid={`tag-option-${tag.name}`}
                    onSelect={() => {
                      onSelect(tag.name);
                      setSearch("");
                      setOpen(false);
                    }}
                  >
                    {tag.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
