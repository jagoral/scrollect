import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { Redirect, useLocalSearchParams } from "expo-router";
import { usePostHog } from "posthog-react-native";

import { AuthGuard } from "@/components/auth-guard";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeedErrorState } from "@/components/feed/feed-error-state";
import { TopicFeedScreen } from "@/components/topics/topic-feed-screen";

export default function TopicDetailRoute() {
  const posthog = usePostHog();
  const { topicId } = useLocalSearchParams<{ topicId: string }>();

  if (!topicId) {
    return <Redirect href="/topics" />;
  }

  return (
    <AuthGuard>
      <ErrorBoundary
        onError={(error) => posthog?.captureException(error)}
        fallback={({ message, reset }) => <FeedErrorState message={message} onRetry={reset} />}
      >
        <TopicFeedScreen topicId={topicId as Id<"topics">} />
      </ErrorBoundary>
    </AuthGuard>
  );
}
