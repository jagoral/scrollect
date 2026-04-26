import type { ReactNode } from "react";
import { Modal, Pressable as RNPressable } from "react-native";

import { View } from "@/tw";

interface BottomSheetProps {
  open: boolean;
  onDismiss: () => void;
  children: ReactNode;
  testID?: string;
}

export function BottomSheet({ open, onDismiss, children, testID }: BottomSheetProps) {
  return (
    <Modal
      animationType="slide"
      transparent
      visible={open}
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      {/* Layout: a flex column where the dismiss-backdrop fills the area
          ABOVE the sheet via `flex-1`, and the sheet sits at the bottom in
          normal flow. Avoiding absolute positioning here means the
          accessibility tree only exposes "Dismiss" for the empty area
          above the sheet — VoiceOver inside the sheet content stays
          focused on the sheet's children. */}
      <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
        <RNPressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          style={styles.backdrop}
        />
        <View
          testID={testID}
          className="rounded-t-2xl bg-white pb-8 pt-2 shadow-lg dark:bg-neutral-900"
        >
          <View className="mx-auto mb-2 mt-1 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  backdrop: { flex: 1 },
} as const;
