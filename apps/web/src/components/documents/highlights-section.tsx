import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { ChevronDown, Highlighter, Trash2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const COLOR_MAP: Record<string, string> = {
  red: "bg-red-400",
  cyan: "bg-cyan-400",
  blue: "bg-blue-400",
  yellow: "bg-yellow-400",
  green: "bg-green-400",
  pink: "bg-pink-400",
};

interface HighlightsSectionProps {
  documentId: Id<"documents">;
}

export function HighlightsSection({ documentId }: HighlightsSectionProps) {
  const { data: highlights } = useQuery(
    convexQuery(api.content.highlights.listByDocument, { documentId }),
  );
  const deleteByDocument = useMutation(api.content.highlights.deleteByDocument);
  const posthog = usePostHog();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!highlights || highlights.length === 0) return null;

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteByDocument({ documentId });
      posthog.capture("highlights.deleted", { count: result.deleted });
      toast.success(`Removed ${result.deleted} highlight${result.deleted !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Failed to remove highlights");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div data-testid="highlights-section" className="mt-6 border-t border-border pt-5">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
              />
            }
          >
            <Highlighter className="size-3.5" />
            Highlights ({highlights.length})
            <ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} />
          </CollapsibleTrigger>

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
                  data-testid="remove-all-highlights"
                />
              }
            >
              <Trash2 data-icon="inline-start" />
              Remove all
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove all highlights</AlertDialogTitle>
                <AlertDialogDescription>
                  Remove all {highlights.length} imported highlight
                  {highlights.length !== 1 ? "s" : ""}? You can re-import them later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={isDeleting}
                  onClick={handleDeleteAll}
                  data-testid="confirm-remove-highlights"
                >
                  Remove all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <CollapsibleContent>
          <ul className="mt-3 flex flex-col gap-2" data-testid="highlights-list">
            {highlights.map((highlight) => (
              <li
                key={highlight._id}
                className="border border-border bg-card p-3"
                data-testid="highlight-item"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "mt-1.5 size-2.5 shrink-0 rounded-full",
                      highlight.sourceMetadata?.color
                        ? (COLOR_MAP[highlight.sourceMetadata.color] ?? "bg-muted-foreground/40")
                        : "bg-muted-foreground/40",
                    )}
                    aria-label={
                      highlight.sourceMetadata?.color
                        ? `${highlight.sourceMetadata.color} highlight`
                        : "highlight"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed">{highlight.text}</p>
                    {highlight.note && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground italic">
                        {highlight.note}
                      </p>
                    )}
                    {highlight.pageNumber && (
                      <p className="mt-1 text-xs text-muted-foreground/60">
                        Page {highlight.pageNumber}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
