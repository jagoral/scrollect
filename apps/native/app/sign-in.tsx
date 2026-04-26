import { Redirect } from "expo-router";
import { KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignInForm } from "@/components/sign-in-form";
import { authClient } from "@/lib/auth-client";
import { useThemeColors } from "@/lib/theme/colors";
import { ActivityIndicator, View } from "@/tw";

export default function SignInScreen() {
  const session = authClient.useSession();
  const colors = useThemeColors();

  if (session.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  if (session.data) {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <SignInForm />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
