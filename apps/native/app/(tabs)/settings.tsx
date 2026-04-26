import { usePostHog } from "posthog-react-native";

import { ErrorBoundary } from "@/components/error-boundary";
import { FeedErrorState } from "@/components/feed/feed-error-state";
import { SettingsScreen } from "@/components/settings/settings-screen";

export default function SettingsRoute() {
  const posthog = usePostHog();
  return (
    <ErrorBoundary
      onError={(error) => posthog?.captureException(error)}
      fallback={({ message, reset }) => <FeedErrorState message={message} onRetry={reset} />}
    >
      <SettingsScreen />
    </ErrorBoundary>
  );
}
