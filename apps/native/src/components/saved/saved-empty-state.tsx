import { Bookmark } from "lucide-react-native";

import { useThemeColor } from "@/lib/theme/colors";
import { Text, View } from "@/tw";

export function SavedEmptyState() {
  const iconColor = useThemeColor("mutedForeground");
  return (
    <View testID="saved-empty-state" className="flex-1 items-center justify-center px-8 py-24">
      <View className="size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
        <Bookmark size={28} color={iconColor} />
      </View>
      <Text className="mt-5 text-center text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        No saved posts yet
      </Text>
      <Text className="mt-2 text-center text-sm leading-5 text-neutral-500 dark:text-neutral-400">
        Save posts from your feed to find them here.
      </Text>
    </View>
  );
}
