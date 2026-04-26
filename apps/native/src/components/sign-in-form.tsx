import * as WebBrowser from "expo-web-browser";
import { usePostHog } from "posthog-react-native";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";
import { useThemeColor } from "@/lib/theme/colors";
import { Pressable, Text, TextInput, View } from "@/tw";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNUP_URL = `${env.EXPO_PUBLIC_SITE_URL}/signup`;
const PRESS_HIT_SLOP = 8;

type FormError = { kind: "validation" | "server"; message: string };

function validate(email: string, password: string): FormError | null {
  if (!EMAIL_REGEX.test(email)) {
    return { kind: "validation", message: "Enter a valid email address." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      kind: "validation",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return null;
}

export function SignInForm() {
  const posthog = usePostHog();
  const placeholderColor = useThemeColor("subtleForeground");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateEmail = (value: string) => {
    setEmail(value);
    if (error) setError(null);
  };

  const updatePassword = (value: string) => {
    setPassword(value);
    if (error) setError(null);
  };

  const handleSubmit = async () => {
    const validationError = validate(email, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSubmitting(true);
    posthog?.capture("user.sign_in_started");

    // `signIn.email` awaits its callbacks synchronously, so the `succeeded`
    // flag is safe to read in the finally block below.
    let succeeded = false;
    try {
      await authClient.signIn.email(
        { email, password },
        {
          onSuccess: () => {
            succeeded = true;
            posthog?.capture("user.signed_in");
          },
          onError: (ctx) => {
            const message = ctx.error.message || ctx.error.statusText || "Sign in failed.";
            setError({ kind: "server", message });
            posthog?.capture("user.sign_in_failed", { reason: message });
          },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed.";
      setError({ kind: "server", message });
      posthog?.capture("user.sign_in_failed", { reason: message });
    } finally {
      // Skip state update on success: the parent screen unmounts via <Redirect>
      // once the session subscription updates, and writing to an unmounted
      // component triggers a warning.
      if (!succeeded) setSubmitting(false);
    }
  };

  const openWebSignUp = () => {
    void WebBrowser.openBrowserAsync(SIGNUP_URL);
  };

  return (
    <View className="flex-1 justify-center px-6">
      <View className="mb-8">
        <Text className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
          Sign in
        </Text>
        <Text className="mt-2 text-base text-neutral-500 dark:text-neutral-400">
          Enter your email to continue to your feed.
        </Text>
      </View>

      <View className="space-y-4">
        <View>
          <Text className="mb-2 text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Email
          </Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!submitting}
            keyboardType="email-address"
            onChangeText={updateEmail}
            placeholder="you@example.com"
            placeholderTextColor={placeholderColor}
            textContentType="emailAddress"
            value={email}
            className="rounded-md border border-neutral-300 bg-white px-3 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </View>

        <View>
          <Text className="mb-2 text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Password
          </Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="current-password"
            autoCorrect={false}
            editable={!submitting}
            onChangeText={updatePassword}
            placeholder="Enter your password"
            placeholderTextColor={placeholderColor}
            secureTextEntry
            textContentType="password"
            value={password}
            className="rounded-md border border-neutral-300 bg-white px-3 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </View>

        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-red-600 dark:text-red-400">
            {error.message}
          </Text>
        ) : null}

        <Button
          variant="primary"
          loading={submitting}
          disabled={submitting}
          onPress={handleSubmit}
          className="mt-2"
        >
          Sign in
        </Button>

        <Pressable
          accessibilityRole="link"
          hitSlop={PRESS_HIT_SLOP}
          onPress={openWebSignUp}
          className="items-center pt-2"
        >
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">
            New to Scrollect?{" "}
            <Text className="font-medium text-neutral-900 dark:text-neutral-50">
              Sign up on the web
            </Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
