import { Redirect } from "expo-router";
import { usePostHog } from "posthog-react-native";

import { ErrorBoundary } from "@/components/error-boundary";
import { FeedErrorState } from "@/components/feed/feed-error-state";
import { FeedScreen } from "@/components/feed/feed-screen";
import { authClient } from "@/lib/auth-client";
import { ActivityIndicator, View } from "@/tw";

export default function FeedRoute() {
  const session = authClient.useSession();
  const posthog = usePostHog();

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

  // The ErrorBoundary catches render-phase errors only (e.g. malformed
  // typeData). Transport errors are handled in two places: mutation
  // rejections surface via Alert in PostCard, and Convex auto-reconnects
  // its WebSocket so transient query disconnects recover transparently.
  return (
    <ErrorBoundary
      onError={(error) => posthog?.captureException(error)}
      fallback={({ message, reset }) => <FeedErrorState message={message} onRetry={reset} />}
    >
      <FeedScreen />
    </ErrorBoundary>
  );
}
