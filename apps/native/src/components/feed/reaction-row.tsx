import { Bookmark, BookmarkCheck, ThumbsDown, ThumbsUp } from "lucide-react-native";

import { IconButton } from "@/components/ui/icon-button";
import { useThemeColors } from "@/lib/theme/colors";
import { View } from "@/tw";

interface ReactionRowProps {
  reaction: "like" | "dislike" | undefined;
  isBookmarked: boolean;
  onToggleLike: () => void;
  onOpenDislike: () => void;
  onToggleBookmark: () => void;
}

const ICON_SIZE = 18;

export function ReactionRow({
  reaction,
  isBookmarked,
  onToggleLike,
  onOpenDislike,
  onToggleBookmark,
}: ReactionRowProps) {
  const colors = useThemeColors();
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
          <BookmarkCheck size={ICON_SIZE} color={colors.bookmark} />
        ) : (
          <Bookmark size={ICON_SIZE} color={colors.mutedForeground} />
        )}
      </IconButton>
      <IconButton
        testID="like-button"
        accessibilityLabel={reaction === "like" ? "Remove like" : "Like"}
        active={reaction === "like"}
        tone="like"
        onPress={onToggleLike}
      >
        <ThumbsUp
          size={ICON_SIZE}
          color={reaction === "like" ? colors.success : colors.mutedForeground}
        />
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
          color={reaction === "dislike" ? colors.warning : colors.mutedForeground}
        />
      </IconButton>
    </View>
  );
}
