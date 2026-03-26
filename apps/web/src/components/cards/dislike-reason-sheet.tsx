import { Ban, BookCheck, Shapes, ThumbsDown } from "lucide-react";
import { useCallback } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

import type { DislikeReason } from "./types";

const DISLIKE_REASONS: ReadonlyArray<{
  reason: DislikeReason;
  label: string;
  icon: typeof ThumbsDown;
}> = [
  { reason: "not_interesting", label: "Not interesting to me", icon: Ban },
  { reason: "already_know", label: "I already know this", icon: BookCheck },
  { reason: "wrong_type", label: "Not my preferred format", icon: Shapes },
  { reason: "low_quality", label: "Low quality / inaccurate", icon: ThumbsDown },
];

interface DislikeReasonSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReasonSelected: (reason: DislikeReason) => void;
  onDismissed: () => void;
}

export function DislikeReasonSheet({
  open,
  onOpenChange,
  onReasonSelected,
  onDismissed,
}: DislikeReasonSheetProps) {
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        onDismissed();
      }
    },
    [onOpenChange, onDismissed],
  );

  const handleSelect = useCallback(
    (reason: DislikeReason) => {
      onReasonSelected(reason);
      handleOpenChange(false);
    },
    [onReasonSelected, handleOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[40dvh] rounded-t-2xl px-0 pb-[env(safe-area-inset-bottom)]"
        data-testid="dislike-reason-sheet"
      >
        <div className="mx-auto mb-1 mt-0 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" />

        <SheetTitle className="sr-only">Why do you dislike this card?</SheetTitle>
        <SheetDescription className="sr-only">
          Select a reason to help us improve your feed.
        </SheetDescription>

        <p className="px-5 pb-1 text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">
          What went wrong?
        </p>

        <div role="group" aria-label="Dislike reasons" className="flex flex-col">
          {DISLIKE_REASONS.map(({ reason, label, icon: Icon }) => (
            <button
              key={reason}
              type="button"
              data-testid={`dislike-reason-${reason}`}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left text-sm text-foreground/90 transition-colors duration-100 hover:bg-muted active:bg-muted/80"
              onClick={() => handleSelect(reason)}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
