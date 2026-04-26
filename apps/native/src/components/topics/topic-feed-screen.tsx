import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { Redirect, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { ChevronLeft } from "lucide-react-native";
import { useCallback } from "react";

import { FeedScreen } from "@/components/feed/feed-screen";
import { useThemeColor } from "@/lib/theme/colors";
import { Pressable, Text, View } from "@/tw";

interface TopicFeedScreenProps {
  topicId: Id<"topics">;
}

export function TopicFeedScreen({ topicId }: TopicFeedScreenProps) {
  const topic = useQuery(api.topics.topics.getTopic, { topicId });

  // `null` means the query resolved but the topic was deleted (or never
  // belonged to this user). Bounce back to the topics index — staying on a
  // ghost topic with an unscoped feed underneath would mislead the user.
  if (topic === null) {
    return <Redirect href="/topics" />;
  }

  const topicName = topic?.topic.name ?? "Topic";
  const learningGoal = topic?.topic.learningGoal ?? "";

  return (
    <FeedScreen
      topicId={topicId}
      header={<TopicFeedHeader title={topicName} learningGoal={learningGoal} />}
    />
  );
}

interface TopicFeedHeaderProps {
  title: string;
  learningGoal: string;
}

function TopicFeedHeader({ title, learningGoal }: TopicFeedHeaderProps) {
  const router = useRouter();
  const iconColor = useThemeColor("mutedForeground");

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/topics");
    }
  }, [router]);

  return (
    <View className="border-b border-neutral-200 bg-white px-5 pt-2 pb-4 dark:border-neutral-800 dark:bg-neutral-950">
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="topic-feed-back"
          onPress={handleBack}
          hitSlop={8}
          className="size-9 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
        >
          <ChevronLeft size={22} color={iconColor} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            Topic feed
          </Text>
          <Text
            numberOfLines={1}
            className="mt-0.5 text-xl font-semibold text-neutral-900 dark:text-neutral-50"
          >
            {title}
          </Text>
        </View>
      </View>
      {learningGoal ? (
        <Text
          numberOfLines={2}
          className="mt-2 text-xs leading-4 text-neutral-500 dark:text-neutral-400"
        >
          {learningGoal}
        </Text>
      ) : null}
    </View>
  );
}
