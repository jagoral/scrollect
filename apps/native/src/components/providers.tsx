import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { PostHogProvider } from "posthog-react-native";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth-client";
import { convex } from "@/lib/convex";
import { env } from "@/lib/env";
import { ThemeProvider } from "@/lib/theme/theme-context";

const postHogApiKey = env.EXPO_PUBLIC_POSTHOG_KEY;
const postHogOptions = { host: env.EXPO_PUBLIC_POSTHOG_HOST };

function AnalyticsProvider({ children }: { children: ReactNode }) {
  // PostHogProvider throws if apiKey is missing; skip it entirely in
  // unconfigured envs (local dev without a key) and let `usePostHog()`
  // return undefined — call sites already guard with optional chaining.
  if (!postHogApiKey) return <>{children}</>;
  return (
    <PostHogProvider apiKey={postHogApiKey} options={postHogOptions}>
      {children}
    </PostHogProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AnalyticsProvider>
        <ConvexBetterAuthProvider client={convex} authClient={authClient}>
          {children}
        </ConvexBetterAuthProvider>
      </AnalyticsProvider>
    </ThemeProvider>
  );
}
