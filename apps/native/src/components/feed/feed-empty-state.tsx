import * as WebBrowser from "expo-web-browser";
import { Sparkles } from "lucide-react-native";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { useThemeColor } from "@/lib/theme/colors";
import { Text, View } from "@/tw";

const LIBRARY_URL = `${env.EXPO_PUBLIC_SITE_URL}/app/library`;

export function FeedEmptyState() {
  const iconColor = useThemeColor("mutedForeground");

  const openLibrary = useCallback(() => {
    void WebBrowser.openBrowserAsync(LIBRARY_URL);
  }, []);

  return (
    <View testID="feed-empty-state" className="flex-1 items-center justify-center px-8 py-24">
      <View className="size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
        <Sparkles size={28} color={iconColor} />
      </View>
      <Text className="mt-5 text-center text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Nothing here yet
      </Text>
      <Text className="mt-2 text-center text-sm leading-5 text-neutral-500 dark:text-neutral-400">
        Add a document on Scrollect web and your feed will fill up automatically.
      </Text>
      <Button variant="secondary" size="sm" className="mt-6" onPress={openLibrary}>
        Open library on web
      </Button>
    </View>
  );
}
