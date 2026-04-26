import { Bell } from "lucide-react-native";

import { Button } from "@/components/ui/button";
import { useThemeColor } from "@/lib/theme/colors";
import { Text, View } from "@/tw";

import { BottomSheet } from "@/components/ui/bottom-sheet";

interface PushPrePromptProps {
  open: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

export function PushPrePrompt({ open, onAccept, onDismiss }: PushPrePromptProps) {
  const accentColor = useThemeColor("accent");
  return (
    <BottomSheet open={open} onDismiss={onDismiss} testID="push-pre-prompt">
      <View
        accessibilityViewIsModal
        accessibilityLabel="Stay in the loop"
        importantForAccessibility="yes"
        className="px-6 pt-2 pb-1"
      >
        <View className="mb-4 flex-row items-center gap-3">
          <Bell size={22} color={accentColor} />
          <Text
            accessibilityRole="header"
            className="text-lg font-semibold text-neutral-900 dark:text-neutral-50"
          >
            Stay in the loop
          </Text>
        </View>
        <Text className="text-sm leading-5 text-neutral-600 dark:text-neutral-300">
          We&apos;ll send a single nudge when fresh insights from your library are ready - never
          more than once a day.
        </Text>
        <View className="mt-6 gap-2">
          <Button onPress={onAccept} accessibilityLabel="Allow notifications">
            Turn on notifications
          </Button>
          <Button variant="ghost" onPress={onDismiss} accessibilityLabel="Not now">
            Not now
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}
