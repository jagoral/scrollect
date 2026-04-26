import { api } from "@scrollect/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import type { Href } from "expo-router";
import { usePostHog } from "posthog-react-native";
import type { PostHog } from "posthog-react-native";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth-client";
import {
  fetchExpoPushToken,
  getPushPermissionStatus,
  requestPushPermission,
  setupNotificationHandler,
} from "@/lib/push/notifications";
import { getHasBeenPrompted, incrementReactionCount, setHasBeenPrompted } from "@/lib/push/storage";

import { PushPrePrompt } from "./push-pre-prompt";

interface PushPromptValue {
  /**
   * Notify the bootstrap that the user just performed a positive engagement
   * (a like, or a dislike with a reason - not an "unlike"). On the first such
   * call per device, the bootstrap may surface the soft pre-prompt; subsequent
   * calls are no-ops once the user has been prompted.
   */
  noteReaction: () => void;
}

const PushPromptContext = createContext<PushPromptValue>({ noteReaction: () => {} });

export function usePushPrompt(): PushPromptValue {
  return useContext(PushPromptContext);
}

/**
 * Allowlist of deep-link targets a server-supplied push payload can send the
 * user to. The `route` field on incoming `data` is matched here exactly; any
 * other value falls back to the feed. Prevents an open-redirect-inside-the-app
 * surface from a misconfigured (or compromised) push payload.
 */
const ALLOWED_DEEP_LINKS: ReadonlyArray<Href> = ["/(tabs)/feed", "/(tabs)/saved", "/(tabs)/topics"];
const FALLBACK_DEEP_LINK: Href = "/(tabs)/feed";
const ALLOWED_PUSH_REASONS = new Set(["draft_pool_refill"]);

function resolveDeepLinkRoute(data: unknown): Href {
  if (data && typeof data === "object" && "route" in data) {
    const route = (data as { route?: unknown }).route;
    if (typeof route === "string") {
      const allowed = ALLOWED_DEEP_LINKS.find((entry) => entry === route);
      if (allowed) return allowed;
    }
  }
  return FALLBACK_DEEP_LINK;
}

function resolvePushReason(data: unknown): string | undefined {
  if (data && typeof data === "object" && "reason" in data) {
    const reason = (data as { reason?: unknown }).reason;
    if (typeof reason === "string" && ALLOWED_PUSH_REASONS.has(reason)) return reason;
  }
  return undefined;
}

const COLD_START_NAVIGATION_RETRY_MS = 50;
const COLD_START_NAVIGATION_MAX_ATTEMPTS = 40;

function navigateWhenReady(target: Href): void {
  let attempts = 0;
  const tryNavigate = () => {
    attempts++;
    try {
      router.navigate(target);
      return;
    } catch {
      if (attempts >= COLD_START_NAVIGATION_MAX_ATTEMPTS) return;
      setTimeout(tryNavigate, COLD_START_NAVIGATION_RETRY_MS);
    }
  };
  tryNavigate();
}

function handleNotificationResponse(opts: {
  response: Notifications.NotificationResponse;
  source: "warm" | "cold";
  posthog: PostHog | undefined;
}): void {
  const { response, source, posthog } = opts;
  const data = response.notification.request.content.data;
  const target = resolveDeepLinkRoute(data);
  const reason = resolvePushReason(data);
  // Allowlist entries are all string `Href`s, so this stringifies safely.
  const routeForAnalytics = typeof target === "string" ? target : JSON.stringify(target);
  posthog?.capture("push_opened", {
    source,
    route: routeForAnalytics,
    ...(reason ? { reason } : {}),
  });
  if (source === "cold") {
    // The navigation tree may not have mounted yet at cold-start; retry on a
    // short interval until it accepts the navigate, then bail out.
    navigateWhenReady(target);
  } else {
    router.navigate(target);
  }
}

export function PushNotificationsBootstrap({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const posthog = usePostHog();
  const upsertPushToken = useMutation(api.notifications.tokens.upsertPushToken);
  const [prePromptOpen, setPrePromptOpen] = useState(false);
  const userId = session.data?.user?.id;
  // Track which user we last successfully registered for so a session-object
  // re-render doesn't re-upsert. Updated only after the upsert resolves.
  const registeredForUserRef = useRef<string | null>(null);

  // Idempotent: configure the foreground handler + Android channel on every
  // mount. Module-level side effects bite tooling that imports this file.
  useEffect(() => {
    void setupNotificationHandler();
  }, []);

  useEffect(() => {
    if (!userId) {
      registeredForUserRef.current = null;
      return;
    }
    if (registeredForUserRef.current === userId) return;
    let cancelled = false;
    void (async () => {
      const status = await getPushPermissionStatus();
      if (cancelled || status !== "granted") return;
      const info = await fetchExpoPushToken();
      if (cancelled || !info) return;
      try {
        await upsertPushToken({ token: info.token, platform: info.platform });
        if (cancelled) return;
        registeredForUserRef.current = userId;
        posthog?.capture("push_token_registered", {
          platform: info.platform,
          source: "launch",
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Unknown error");
        posthog?.captureException(err, { stage: "push_token_register" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [posthog, upsertPushToken, userId]);

  // `useLastNotificationResponse` exposes the response that *launched* the app
  // (cold start) AND each subsequent response while the hook is mounted (warm
  // taps). Distinguish them by capturing the very-first observed response on
  // initial render: that one is "cold", everything after is "warm". Tracking
  // by identifier deduplicates across re-renders.
  const lastResponse = Notifications.useLastNotificationResponse();
  const initialResponseIdRef = useRef<string | null | undefined>(undefined);
  const handledResponseIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialResponseIdRef.current === undefined) {
      initialResponseIdRef.current = lastResponse
        ? lastResponse.notification.request.identifier
        : null;
    }
    if (!lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handledResponseIdRef.current === id) return;
    handledResponseIdRef.current = id;
    const source = initialResponseIdRef.current === id ? "cold" : "warm";
    handleNotificationResponse({ response: lastResponse, source, posthog });
  }, [lastResponse, posthog]);

  const noteReaction = useCallback(() => {
    void (async () => {
      const newCount = await incrementReactionCount();
      if (newCount !== 1) return;
      if (await getHasBeenPrompted()) return;
      const status = await getPushPermissionStatus();
      if (status !== "undetermined") return;
      setPrePromptOpen(true);
    })();
  }, []);

  const handleAccept = useCallback(async () => {
    setPrePromptOpen(false);
    posthog?.capture("push_permission_prompted");
    const status = await requestPushPermission();
    // If the OS prompt resolves as undetermined (e.g. user backgrounded the
    // app before responding), don't persist the prompted flag - they need
    // another chance on next reaction. Only commit on a decisive answer.
    if (status === "undetermined") return;
    await setHasBeenPrompted();
    if (status === "granted") {
      posthog?.capture("push_permission_granted");
      const info = await fetchExpoPushToken();
      if (!info) return;
      try {
        await upsertPushToken({ token: info.token, platform: info.platform });
        if (userId) registeredForUserRef.current = userId;
        posthog?.capture("push_token_registered", {
          platform: info.platform,
          source: "permission_grant",
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Unknown error");
        posthog?.captureException(err, { stage: "push_token_register" });
      }
    } else {
      posthog?.capture("push_permission_denied");
    }
  }, [posthog, upsertPushToken, userId]);

  const handleDismiss = useCallback(async () => {
    setPrePromptOpen(false);
    await setHasBeenPrompted();
    posthog?.capture("push_pre_prompt_dismissed");
  }, [posthog]);

  return (
    <PushPromptContext.Provider value={{ noteReaction }}>
      {children}
      <PushPrePrompt
        open={prePromptOpen}
        onAccept={() => void handleAccept()}
        onDismiss={() => void handleDismiss()}
      />
    </PushPromptContext.Provider>
  );
}
