import { Redirect } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { ActivityIndicator, View } from "@/tw";

export default function HomeScreen() {
  const session = authClient.useSession();

  if (session.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#171717" />
      </View>
    );
  }

  if (!session.data) {
    return <Redirect href="/sign-in" />;
  }

  return <Redirect href="/feed" />;
}
