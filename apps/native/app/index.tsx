import { Redirect } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { useThemeColors } from "@/lib/theme/colors";
import { ActivityIndicator, View } from "@/tw";

export default function HomeScreen() {
  const session = authClient.useSession();
  const colors = useThemeColors();

  if (session.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  if (!session.data) {
    return <Redirect href="/sign-in" />;
  }

  return <Redirect href="/feed" />;
}
