import { Redirect } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useCallback } from "react";

import { authClient } from "@/lib/auth-client";
import { ActivityIndicator, Pressable, Text, View } from "@/tw";

export default function HomeScreen() {
  const session = authClient.useSession();
  const posthog = usePostHog();

  const handleSignOut = useCallback(async () => {
    // Capture before sign-out so the event keeps the user's distinct_id;
    // reset() afterwards clears it for the next anonymous session, and runs
    // in finally so a transient signOut() rejection still clears identity.
    posthog?.capture("user.signed_out");
    try {
      await authClient.signOut();
    } finally {
      posthog?.reset();
    }
  }, [posthog]);

  if (session.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#171717" />
      </View>
    );
  }

  if (!session.data) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-2xl font-bold text-neutral-900">Scrollect</Text>
      <Text className="mt-2 text-base text-neutral-500">
        Signed in as {session.data.user.email}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={handleSignOut}
        className="mt-8 rounded-md border border-neutral-300 px-4 py-2 active:opacity-90"
      >
        <Text className="text-base font-medium text-neutral-900">Sign out</Text>
      </Pressable>
    </View>
  );
}
