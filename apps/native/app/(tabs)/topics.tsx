import { usePostHog } from "posthog-react-native";

import { ErrorBoundary } from "@/components/error-boundary";
import { FeedErrorState } from "@/components/feed/feed-error-state";
import { TopicsListScreen } from "@/components/topics/topics-list-screen";

export default function TopicsRoute() {
  const posthog = usePostHog();
  return (
    <ErrorBoundary
      onError={(error) => posthog?.captureException(error)}
      fallback={({ message, reset }) => <FeedErrorState message={message} onRetry={reset} />}
    >
      <TopicsListScreen />
    </ErrorBoundary>
  );
}
