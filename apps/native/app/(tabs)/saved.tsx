import { usePostHog } from "posthog-react-native";

import { ErrorBoundary } from "@/components/error-boundary";
import { FeedErrorState } from "@/components/feed/feed-error-state";
import { SavedScreen } from "@/components/saved/saved-screen";

export default function SavedRoute() {
  const posthog = usePostHog();
  return (
    <ErrorBoundary
      onError={(error) => posthog?.captureException(error)}
      fallback={({ message, reset }) => <FeedErrorState message={message} onRetry={reset} />}
    >
      <SavedScreen />
    </ErrorBoundary>
  );
}
