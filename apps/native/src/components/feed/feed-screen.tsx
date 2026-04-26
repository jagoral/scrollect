import { LogOut } from "lucide-react-native";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, FlatList, type ListRenderItemInfo, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button";
import { useFeed } from "@/hooks/use-feed";
import { authClient } from "@/lib/auth-client";
import { Text, View } from "@/tw";

import { FeedEmptyState } from "./feed-empty-state";
import { FeedSkeleton } from "./feed-skeleton";
import { PostCard } from "./post-card";
import type { FeedPost } from "./types";

const ON_END_REACHED_THRESHOLD = 0.6;

export function FeedScreen() {
  const posthog = usePostHog();
  const { results, status, refreshing, onRefresh, onEndReached } = useFeed();

  const renderItem = useCallback(({ item }: ListRenderItemInfo<FeedPost>) => {
    return <PostCard post={item} />;
  }, []);

  const keyExtractor = useCallback((post: FeedPost) => post._id as string, []);

  // Fire `feed.viewed` once per status transition out of LoadingFirstPage —
  // we read `results.length` at fire time (closure) but intentionally omit it
  // from deps so this fires on the load → ready transition, not on every
  // pagination tick that grows the list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (status === "LoadingFirstPage") return;
    posthog?.capture("feed.viewed", { post_count: results.length });
  }, [status]);

  if (status === "LoadingFirstPage") {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <FeedHeader />
        <FeedSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <FeedHeader />
      <FlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={ON_END_REACHED_THRESHOLD}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#171717" />
        }
        ListEmptyComponent={<FeedEmptyState />}
        ListFooterComponent={
          status === "LoadingMore" ? (
            <View className="items-center py-6">
              <ActivityIndicator color="#171717" />
            </View>
          ) : status === "Exhausted" && results.length > 0 ? (
            <View className="items-center py-8">
              <Text className="text-xs uppercase tracking-widest text-neutral-400">
                You&apos;re all caught up
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={results.length === 0 ? styles.emptyContainer : undefined}
      />
    </SafeAreaView>
  );
}

function FeedHeader() {
  const posthog = usePostHog();

  const handleSignOut = useCallback(async () => {
    posthog?.capture("user.signed_out");
    try {
      await authClient.signOut();
    } finally {
      posthog?.reset();
    }
  }, [posthog]);

  return (
    <View className="flex-row items-end justify-between border-b border-neutral-200 bg-white px-5 pt-2 pb-4">
      <View>
        <Text className="text-[11px] font-medium uppercase tracking-widest text-neutral-400">
          Your Feed
        </Text>
        <Text className="mt-1 text-2xl font-semibold text-neutral-900">Scrollect</Text>
      </View>
      <IconButton accessibilityLabel="Sign out" testID="sign-out-button" onPress={handleSignOut}>
        <LogOut size={18} color="#737373" />
      </IconButton>
    </View>
  );
}

const styles = {
  root: { flex: 1, backgroundColor: "#ffffff" } as const,
  emptyContainer: { flexGrow: 1 } as const,
};
