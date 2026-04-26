import { AlertTriangle } from "lucide-react-native";

import { Button } from "@/components/ui/button";
import { useThemeColor } from "@/lib/theme/colors";
import { Text, View } from "@/tw";

interface FeedErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function FeedErrorState({ message, onRetry }: FeedErrorStateProps) {
  const iconColor = useThemeColor("destructive");
  return (
    <View testID="feed-error-state" className="flex-1 items-center justify-center px-8 py-24">
      <View className="size-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
        <AlertTriangle size={28} color={iconColor} />
      </View>
      <Text className="mt-5 text-center text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Something went wrong
      </Text>
      <Text className="mt-2 text-center text-sm leading-5 text-neutral-500 dark:text-neutral-400">
        {message}
      </Text>
      <Button variant="secondary" size="sm" className="mt-6" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}
