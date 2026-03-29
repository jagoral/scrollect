import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Ban, BookCheck, Shapes, ThumbsDown } from "lucide-react";
import type { RefObject } from "react";
import { useCallback } from "react";

import { Popover, PopoverContent, PopoverDescription, PopoverTitle } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-is-mobile";

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

function ReasonList({ onSelect }: { onSelect: (reason: DislikeReason) => void }) {
  return (
    <div role="group" aria-label="Dislike reasons" className="flex flex-col">
      {DISLIKE_REASONS.map(({ reason, label, icon: Icon }) => (
        <button
          key={reason}
          type="button"
          data-testid={`dislike-reason-${reason}`}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left text-sm text-foreground/90 transition-colors duration-100 hover:bg-muted active:bg-muted/80 md:min-h-9 md:gap-2.5 md:px-3 md:py-2"
          onClick={() => onSelect(reason)}
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

interface DislikeReasonSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReasonSelected: (reason: DislikeReason) => void;
  onDismissed: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
}

export function DislikeReasonSheet({
  open,
  onOpenChange,
  onReasonSelected,
  onDismissed,
  anchorRef,
}: DislikeReasonSheetProps) {
  const isMobile = useIsMobile();

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

  if (!isMobile) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverPrimitive.Backdrop className="fixed inset-0 z-40" />
        <PopoverContent
          anchor={anchorRef}
          side="top"
          align="end"
          sideOffset={6}
          data-testid="dislike-reason-sheet"
          className="w-56 gap-0 p-0 py-1"
        >
          <PopoverTitle className="sr-only">Why do you dislike this card?</PopoverTitle>
          <PopoverDescription className="sr-only">
            Select a reason to help improve your feed.
          </PopoverDescription>
          <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
            What went wrong?
          </p>
          <ReasonList onSelect={handleSelect} />
        </PopoverContent>
      </Popover>
    );
  }

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

        <ReasonList onSelect={handleSelect} />
      </SheetContent>
    </Sheet>
  );
}
