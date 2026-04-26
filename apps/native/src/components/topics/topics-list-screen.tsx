import type { Doc, Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useRouter } from "expo-router";
import { ChevronRight, Folder, Layers } from "lucide-react-native";
import { usePostHog } from "posthog-react-native";
import { useCallback } from "react";
import { ActivityIndicator, FlatList, type ListRenderItemInfo } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTopics } from "@/hooks/use-topics";
import { useThemeColor } from "@/lib/theme/colors";
import { Pressable, Text, View } from "@/tw";

type Topic = Doc<"topics"> & { documentCount: number };

export function TopicsListScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const { topics, isLoading } = useTopics();
  const spinnerColor = useThemeColor("foreground");
  const chevronColor = useThemeColor("mutedForeground");

  const handleOpenTopic = useCallback(
    (topicId: Id<"topics">) => {
      router.push({ pathname: "/topics/[topicId]", params: { topicId } });
      posthog?.capture("topic_opened", { topic_id: topicId });
    },
    [posthog, router],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Topic>) => (
      <TopicRow topic={item} onPress={handleOpenTopic} chevronColor={chevronColor} />
    ),
    [chevronColor, handleOpenTopic],
  );

  const keyExtractor = useCallback((topic: Topic) => topic._id as string, []);

  if (isLoading) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-white dark:bg-neutral-950">
        <TopicsHeader />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={spinnerColor} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-white dark:bg-neutral-950">
      <TopicsHeader />
      <FlatList
        data={topics ?? []}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={<TopicsEmptyState />}
        contentContainerStyle={(topics ?? []).length === 0 ? styles.emptyContainer : undefined}
      />
    </SafeAreaView>
  );
}

function TopicsHeader() {
  return (
    <View className="border-b border-neutral-200 bg-white px-5 pt-2 pb-4 dark:border-neutral-800 dark:bg-neutral-950">
      <Text className="text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Knowledge Areas
      </Text>
      <Text className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        Topics
      </Text>
    </View>
  );
}

interface TopicRowProps {
  topic: Topic;
  onPress: (topicId: Id<"topics">) => void;
  chevronColor: string;
}

function TopicRow({ topic, onPress, chevronColor }: TopicRowProps) {
  const iconColor = useThemeColor("accent");
  const docCountLabel = `${topic.documentCount} doc${topic.documentCount === 1 ? "" : "s"}`;

  return (
    <Pressable
      testID="topic-row"
      accessibilityRole="button"
      accessibilityLabel={`Open ${topic.name} topic`}
      onPress={() => onPress(topic._id)}
      className="flex-row items-center gap-3 border-b border-neutral-200 bg-white px-5 py-4 active:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:active:bg-neutral-900"
    >
      <View className="size-11 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/5 dark:border-violet-300/30 dark:bg-violet-300/10">
        <Folder size={20} color={iconColor} />
      </View>
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className="text-base font-semibold text-neutral-900 dark:text-neutral-50"
        >
          {topic.name}
        </Text>
        <Text className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
          {docCountLabel}
        </Text>
        {topic.learningGoal ? (
          <Text
            numberOfLines={2}
            className="mt-1.5 text-sm leading-5 text-neutral-600 dark:text-neutral-300"
          >
            {topic.learningGoal}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={chevronColor} />
    </Pressable>
  );
}

function TopicsEmptyState() {
  const iconColor = useThemeColor("mutedForeground");
  return (
    <View testID="topics-empty-state" className="flex-1 items-center justify-center px-8 py-24">
      <View className="size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
        <Layers size={28} color={iconColor} />
      </View>
      <Text className="mt-5 text-center text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        No topics yet
      </Text>
      <Text className="mt-2 text-center text-sm leading-5 text-neutral-500 dark:text-neutral-400">
        Create topics on Scrollect web to focus your feed on specific learning goals.
      </Text>
    </View>
  );
}

const styles = {
  emptyContainer: { flexGrow: 1 } as const,
};
