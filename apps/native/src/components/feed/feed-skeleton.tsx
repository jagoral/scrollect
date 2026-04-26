import { View } from "@/tw";

const SKELETON_KEYS = ["a", "b", "c"] as const;

export function FeedSkeleton() {
  return (
    <View testID="feed-skeleton" className="flex-1 bg-white">
      {SKELETON_KEYS.map((key) => (
        <View key={key} className="border-b border-neutral-200 bg-white px-5 py-6">
          <View className="h-3 w-16 rounded bg-neutral-200" />
          <View className="mt-4 h-4 w-full rounded bg-neutral-100" />
          <View className="mt-2 h-4 w-5/6 rounded bg-neutral-100" />
          <View className="mt-2 h-4 w-2/3 rounded bg-neutral-100" />
          <View className="mt-5 flex-row items-center justify-between">
            <View className="h-3 w-32 rounded bg-neutral-100" />
            <View className="flex-row gap-2">
              <View className="size-9 rounded-full bg-neutral-100" />
              <View className="size-9 rounded-full bg-neutral-100" />
              <View className="size-9 rounded-full bg-neutral-100" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
