import { Redirect } from "expo-router";
import { KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignInForm } from "@/components/sign-in-form";
import { authClient } from "@/lib/auth-client";
import { ActivityIndicator, View } from "@/tw";

export default function SignInScreen() {
  const session = authClient.useSession();

  if (session.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#171717" />
      </View>
    );
  }

  if (session.data) {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <SignInForm />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
