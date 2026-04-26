import { Ban, BookCheck, Shapes, ThumbsDown, type LucideIcon } from "lucide-react-native";
import { useCallback } from "react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useThemeColor } from "@/lib/theme/colors";
import { Pressable, Text, View } from "@/tw";

import type { DislikeReason } from "./types";

const DISLIKE_REASONS: ReadonlyArray<{
  reason: DislikeReason;
  label: string;
  icon: LucideIcon;
}> = [
  { reason: "not_interesting", label: "Not interesting to me", icon: Ban },
  { reason: "already_know", label: "I already know this", icon: BookCheck },
  { reason: "wrong_type", label: "Not my preferred format", icon: Shapes },
  { reason: "low_quality", label: "Low quality / inaccurate", icon: ThumbsDown },
];

interface DislikeReasonSheetProps {
  open: boolean;
  onClose: () => void;
  onReasonSelected: (reason: DislikeReason) => void;
}

export function DislikeReasonSheet({ open, onClose, onReasonSelected }: DislikeReasonSheetProps) {
  const iconColor = useThemeColor("mutedForeground");

  const handleSelect = useCallback(
    (reason: DislikeReason) => {
      onReasonSelected(reason);
      onClose();
    },
    [onClose, onReasonSelected],
  );

  return (
    <BottomSheet open={open} onDismiss={onClose} testID="dislike-reason-sheet">
      <Text className="px-5 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        What went wrong?
      </Text>
      <View accessibilityLabel="Dislike reasons">
        {DISLIKE_REASONS.map(({ reason, label, icon: Icon }) => (
          <Pressable
            key={reason}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={`dislike-reason-${reason}`}
            onPress={() => handleSelect(reason)}
            className="flex-row items-center gap-3 px-5 py-4 active:bg-neutral-100 dark:active:bg-neutral-800"
          >
            <Icon size={18} color={iconColor} />
            <Text className="text-base text-neutral-900 dark:text-neutral-50">{label}</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}
