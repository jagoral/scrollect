import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";

export function usePostHogIdentify() {
  const posthog = usePostHog();
  const { data: user } = useQuery(convexQuery(api.auth.getCurrentUser, {}));
  const identifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?._id || identifiedRef.current === user._id) return;
    posthog.identify(user._id);
    identifiedRef.current = user._id;
  }, [posthog, user?._id]);
}
