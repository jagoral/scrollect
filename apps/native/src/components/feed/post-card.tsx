import { api } from "@scrollect/backend/convex/_generated/api";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { usePostHog } from "posthog-react-native";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

import { haptics } from "@/lib/haptics";
import { Text, View } from "@/tw";

import { DislikeReasonSheet } from "./dislike-reason-sheet";
import { PostCardContent } from "./post-card-content";
import { ReactionRow } from "./reaction-row";
import type { DislikeReason, FeedPost } from "./types";

const POST_TYPE_LABEL: Record<FeedPost["postType"], string> = {
  insight: "Insight",
  quiz: "Quiz",
  quote: "Quote",
  summary: "Summary",
  connection: "Connection",
};

interface PostCardProps {
  post: FeedPost;
}

function updatePostInPaginatedPages(
  localStore: OptimisticLocalStore,
  postId: FeedPost["_id"],
  updater: (post: Record<string, unknown>) => Record<string, unknown>,
) {
  const allPages = localStore.getAllQueries(api.feed.queries.list);
  for (const { args, value } of allPages) {
    if (value === undefined) continue;
    if (!value.page.some((p) => p._id === postId)) continue;
    localStore.setQuery(api.feed.queries.list, args, {
      ...value,
      page: value.page.map((p) => (p._id === postId ? { ...p, ...updater(p) } : p)),
    });
  }
}

function removePostFromPaginatedPages(localStore: OptimisticLocalStore, postId: FeedPost["_id"]) {
  const allPages = localStore.getAllQueries(api.feed.queries.list);
  for (const { args, value } of allPages) {
    if (value === undefined) continue;
    if (!value.page.some((p) => p._id === postId)) continue;
    localStore.setQuery(api.feed.queries.list, args, {
      ...value,
      page: value.page.filter((p) => p._id !== postId),
    });
  }
}

export function PostCard({ post }: PostCardProps) {
  const posthog = usePostHog();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reasonSelectedDuringSession, setReasonSelectedDuringSession] = useState(false);

  const toggleBookmark = useMutation(api.content.bookmarks.toggle).withOptimisticUpdate(
    (localStore, args) => {
      updatePostInPaginatedPages(localStore, args.postId, (p) => ({
        isBookmarked: !p.isBookmarked,
      }));
    },
  );

  const setReaction = useMutation(api.feed.queries.setReaction).withOptimisticUpdate(
    (localStore, args) => {
      if (args.reaction === "dislike") {
        removePostFromPaginatedPages(localStore, args.postId);
        return;
      }
      updatePostInPaginatedPages(localStore, args.postId, () => ({
        reaction: args.reaction === "none" ? undefined : args.reaction,
      }));
    },
  );

  const reportMutationError = useCallback(
    (error: unknown, context: "bookmark" | "reaction") => {
      const err = error instanceof Error ? error : new Error("Unknown error");
      posthog?.captureException(err, { context });
      // Use the system Alert: we don't have a toast library on mobile (M3
      // scope) and silently swallowing the error after an optimistic update
      // would leave the UI in a state that disagrees with the server.
      Alert.alert(
        context === "bookmark" ? "Couldn't update bookmark" : "Couldn't save reaction",
        err.message || "Please try again.",
      );
    },
    [posthog],
  );

  const handleToggleBookmark = useCallback(async () => {
    haptics.bookmark();
    posthog?.capture("post.bookmarked", {
      post_type: post.postType,
      bookmarked: !post.isBookmarked,
    });
    try {
      await toggleBookmark({ postId: post._id });
    } catch (error) {
      reportMutationError(error, "bookmark");
    }
  }, [post._id, post.isBookmarked, post.postType, posthog, reportMutationError, toggleBookmark]);

  const handleToggleLike = useCallback(async () => {
    const nextReaction = post.reaction === "like" ? "none" : "like";
    haptics.reactionLike();
    posthog?.capture("post.reacted", {
      post_type: post.postType,
      reaction: nextReaction,
    });
    try {
      await setReaction({ postId: post._id, reaction: nextReaction });
    } catch (error) {
      reportMutationError(error, "reaction");
    }
  }, [post._id, post.postType, post.reaction, posthog, reportMutationError, setReaction]);

  const handleOpenDislike = useCallback(() => {
    setReasonSelectedDuringSession(false);
    setSheetOpen(true);
    posthog?.capture("post.dislike_reason_sheet_opened", {
      post_type: post.postType,
    });
  }, [post.postType, posthog]);

  const handleCloseDislike = useCallback(() => {
    setSheetOpen(false);
    posthog?.capture("post.dislike_reason_sheet_dismissed", {
      post_type: post.postType,
      selected: reasonSelectedDuringSession,
    });
  }, [post.postType, posthog, reasonSelectedDuringSession]);

  const handleReasonSelected = useCallback(
    async (reason: DislikeReason) => {
      setReasonSelectedDuringSession(true);
      haptics.reactionDislike();
      posthog?.capture("post.reacted", {
        post_type: post.postType,
        reaction: "dislike",
        dislike_reason: reason,
      });
      posthog?.capture("post.dislike_reason_selected", {
        post_type: post.postType,
        dislike_reason: reason,
        source_document_id: post.primarySourceDocumentId,
        post_draft_id: post.postDraftId ?? null,
      });
      posthog?.capture("post.hidden_by_dislike", {
        post_type: post.postType,
        dislike_reason: reason,
      });
      try {
        await setReaction({
          postId: post._id,
          reaction: "dislike",
          dislikeReason: reason,
        });
      } catch (error) {
        reportMutationError(error, "reaction");
      }
    },
    [
      post._id,
      post.postDraftId,
      post.postType,
      post.primarySourceDocumentId,
      posthog,
      reportMutationError,
      setReaction,
    ],
  );

  return (
    <>
      <View
        testID="post-card"
        accessibilityLabel={`${POST_TYPE_LABEL[post.postType]} post`}
        className="border-b border-neutral-200 bg-white px-5 pt-5 pb-4 dark:border-neutral-800 dark:bg-neutral-950"
      >
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[10px] font-medium uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            {POST_TYPE_LABEL[post.postType]}
          </Text>
          {post.sectionTitle ? (
            <Text
              numberOfLines={1}
              className="ml-3 max-w-[55%] text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500"
            >
              &sect; {post.sectionTitle}
            </Text>
          ) : null}
        </View>

        <PostCardContent post={post} />

        <View className="mt-4 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <View className="flex-1 pr-3">
            <Text
              testID="source-badge"
              numberOfLines={1}
              className="text-xs font-medium text-neutral-700 dark:text-neutral-300"
            >
              {post.primarySourceDocumentTitle ?? "Untitled"}
            </Text>
          </View>
          <ReactionRow
            reaction={post.reaction ?? undefined}
            isBookmarked={!!post.isBookmarked}
            onToggleBookmark={handleToggleBookmark}
            onToggleLike={handleToggleLike}
            onOpenDislike={handleOpenDislike}
          />
        </View>
      </View>

      <DislikeReasonSheet
        open={sheetOpen}
        onClose={handleCloseDislike}
        onReasonSelected={handleReasonSelected}
      />
    </>
  );
}
