import { api } from "@scrollect/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { usePostHog } from "posthog-react-native";
import { useEffect, useRef } from "react";

export function useTopics() {
  const posthog = usePostHog();
  const topics = useQuery(api.topics.topics.listTopics, {});

  // Fire `topics_viewed` exactly once per mount, after the query resolves.
  // useFireOnce gates on first render, so we use a manual ref here because
  // we need to wait until `topics` is defined before firing.
  const viewedFiredRef = useRef(false);
  useEffect(() => {
    if (topics === undefined) return;
    if (viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    posthog?.capture("topics_viewed", { topic_count: topics.length });
  }, [posthog, topics]);

  return {
    topics,
    isLoading: topics === undefined,
  };
}
