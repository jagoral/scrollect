import { useCallback } from "react";
import { ActivityIndicator, FlatList, type ListRenderItemInfo, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PostListSkeleton } from "@/components/feed/post-list-skeleton";
import { PostCard } from "@/components/feed/post-card";
import type { FeedPost } from "@/components/feed/types";
import { useSaved } from "@/hooks/use-saved";
import { useThemeColor } from "@/lib/theme/colors";
import { Text, View } from "@/tw";

import { SavedEmptyState } from "./saved-empty-state";

const ON_END_REACHED_THRESHOLD = 0.6;

export function SavedScreen() {
  const { posts, status, refreshing, onRefresh, onEndReached } = useSaved();
  const spinnerColor = useThemeColor("foreground");

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FeedPost>) => <PostCard post={item} />,
    [],
  );
  const keyExtractor = useCallback((post: FeedPost) => post._id as string, []);

  if (status === "LoadingFirstPage") {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-white dark:bg-neutral-950">
        <SavedHeader />
        <PostListSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-white dark:bg-neutral-950">
      <SavedHeader />
      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={ON_END_REACHED_THRESHOLD}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={spinnerColor} />
        }
        ListEmptyComponent={<SavedEmptyState />}
        ListFooterComponent={
          status === "LoadingMore" ? (
            <View className="items-center py-6">
              <ActivityIndicator color={spinnerColor} />
            </View>
          ) : status === "Exhausted" && posts.length > 0 ? (
            <View className="items-center py-8">
              <Text className="text-xs uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                You&apos;ve seen all your saved posts
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={posts.length === 0 ? styles.emptyContainer : undefined}
      />
    </SafeAreaView>
  );
}

function SavedHeader() {
  return (
    <View className="border-b border-neutral-200 bg-white px-5 pt-2 pb-4 dark:border-neutral-800 dark:bg-neutral-950">
      <Text className="text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Bookmarks
      </Text>
      <Text className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        Saved
      </Text>
    </View>
  );
}

const styles = {
  emptyContainer: { flexGrow: 1 } as const,
};
