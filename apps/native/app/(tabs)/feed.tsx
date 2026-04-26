import { usePostHog } from "posthog-react-native";

import { ErrorBoundary } from "@/components/error-boundary";
import { FeedErrorState } from "@/components/feed/feed-error-state";
import { FeedScreen } from "@/components/feed/feed-screen";

export default function FeedRoute() {
  const posthog = usePostHog();

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
