import { Bookmark, BookmarkCheck, ThumbsDown, ThumbsUp } from "lucide-react-native";

import { IconButton } from "@/components/ui/icon-button";
import { View } from "@/tw";

interface ReactionRowProps {
  reaction: "like" | "dislike" | undefined;
  isBookmarked: boolean;
  onToggleLike: () => void;
  onOpenDislike: () => void;
  onToggleBookmark: () => void;
}

const ICON_SIZE = 18;
const NEUTRAL_COLOR = "#737373";
const LIKE_COLOR = "#059669";
const DISLIKE_COLOR = "#ef4444";
const BOOKMARK_COLOR = "#171717";

export function ReactionRow({
  reaction,
  isBookmarked,
  onToggleLike,
  onOpenDislike,
  onToggleBookmark,
}: ReactionRowProps) {
  return (
    <View className="flex-row items-center gap-1">
      <IconButton
        testID="save-button"
        accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark"}
        active={isBookmarked}
        tone="bookmark"
        onPress={onToggleBookmark}
      >
        {isBookmarked ? (
          <BookmarkCheck size={ICON_SIZE} color={BOOKMARK_COLOR} />
        ) : (
          <Bookmark size={ICON_SIZE} color={NEUTRAL_COLOR} />
        )}
      </IconButton>
      <IconButton
        testID="like-button"
        accessibilityLabel={reaction === "like" ? "Remove like" : "Like"}
        active={reaction === "like"}
        tone="like"
        onPress={onToggleLike}
      >
        <ThumbsUp size={ICON_SIZE} color={reaction === "like" ? LIKE_COLOR : NEUTRAL_COLOR} />
      </IconButton>
      <IconButton
        testID="dislike-button"
        accessibilityLabel="Dislike"
        active={reaction === "dislike"}
        tone="dislike"
        onPress={onOpenDislike}
      >
        <ThumbsDown
          size={ICON_SIZE}
          color={reaction === "dislike" ? DISLIKE_COLOR : NEUTRAL_COLOR}
        />
      </IconButton>
    </View>
  );
}
