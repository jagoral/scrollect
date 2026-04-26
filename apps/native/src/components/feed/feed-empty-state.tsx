import * as WebBrowser from "expo-web-browser";
import { Sparkles } from "lucide-react-native";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { Text, View } from "@/tw";

const LIBRARY_URL = `${env.EXPO_PUBLIC_SITE_URL}/app/library`;

export function FeedEmptyState() {
  const openLibrary = useCallback(() => {
    void WebBrowser.openBrowserAsync(LIBRARY_URL);
  }, []);

  return (
    <View testID="feed-empty-state" className="flex-1 items-center justify-center px-8 py-24">
      <View className="size-16 items-center justify-center rounded-full bg-neutral-100">
        <Sparkles size={28} color="#737373" />
      </View>
      <Text className="mt-5 text-center text-lg font-semibold text-neutral-900">
        Nothing here yet
      </Text>
      <Text className="mt-2 text-center text-sm leading-5 text-neutral-500">
        Add a document on Scrollect web and your feed will fill up automatically.
      </Text>
      <Button variant="secondary" size="sm" className="mt-6" onPress={openLibrary}>
        Open library on web
      </Button>
    </View>
  );
}
