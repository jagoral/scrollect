import { api } from "@scrollect/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import * as Application from "expo-application";
import * as Linking from "expo-linking";
import { LogOut, Mail, User } from "lucide-react-native";
import { usePostHog } from "posthog-react-native";
import { useCallback } from "react";
import { Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";
import { useThemeColor } from "@/lib/theme/colors";
import type { ThemePreference } from "@/lib/theme/storage";
import { useTheme } from "@/lib/theme/theme-context";
import { Pressable, Text, View } from "@/tw";

import { useFireOnce } from "@/hooks/use-fire-once";

import { ThemePicker } from "./theme-picker";

const SUBSCRIPTION_URL = `${env.EXPO_PUBLIC_SITE_URL}/app/settings`;
const DELETE_ACCOUNT_URL = `${env.EXPO_PUBLIC_SITE_URL}/app/settings`;

type ExternalLinkTarget = "subscription" | "delete_account";

export function SettingsScreen() {
  const posthog = usePostHog();
  const user = useQuery(api.access.auth.getCurrentUser, {});
  const { preference, setPreference } = useTheme();
  const iconColor = useThemeColor("mutedForeground");
  const destructiveColor = useThemeColor("destructive");

  useFireOnce(() => {
    posthog?.capture("settings_viewed");
  });

  const handleSetTheme = useCallback(
    async (next: ThemePreference) => {
      if (next === preference) return;
      // Apply the change before logging so concurrent taps converge — the
      // mutation updates the React state used by the next callback's guard.
      await setPreference(next);
      posthog?.capture("theme_changed", { theme: next });
    },
    [posthog, preference, setPreference],
  );

  const openExternalLink = useCallback(
    async (target: ExternalLinkTarget, url: string) => {
      posthog?.capture("external_link_opened", { target });
      try {
        await Linking.openURL(url);
      } catch (error) {
        // Some Android emulators have no browser installed; surfacing the URL
        // is more helpful than a silent failure. We also log the exception so
        // wild failures (malformed URL, no handler) are observable.
        const err = error instanceof Error ? error : new Error("openURL failed");
        posthog?.captureException(err, { target });
        Alert.alert("Couldn't open browser", url);
      }
    },
    [posthog],
  );

  const handleManageSubscription = useCallback(() => {
    void openExternalLink("subscription", SUBSCRIPTION_URL);
  }, [openExternalLink]);

  const handleDeleteAccount = useCallback(() => {
    void openExternalLink("delete_account", DELETE_ACCOUNT_URL);
  }, [openExternalLink]);

  const handleSignOut = useCallback(async () => {
    posthog?.capture("user.signed_out");
    try {
      await authClient.signOut();
    } finally {
      posthog?.reset();
    }
  }, [posthog]);

  const appVersion = Application.nativeApplicationVersion ?? "0.0.0";
  const buildVersion = Application.nativeBuildVersion;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-white dark:bg-neutral-950">
      <SettingsHeader />
      <ScrollView className="flex-1" contentContainerStyle={styles.content}>
        <Section title="Account">
          <View className="border border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900">
            <View className="flex-row items-center gap-3">
              <User size={16} color={iconColor} />
              <Text
                testID="settings-user-name"
                className="text-sm text-neutral-900 dark:text-neutral-50"
              >
                {user?.name ?? "—"}
              </Text>
            </View>
            <View className="mt-3 flex-row items-center gap-3">
              <Mail size={16} color={iconColor} />
              <Text
                testID="settings-user-email"
                className="text-sm text-neutral-500 dark:text-neutral-400"
              >
                {user?.email ?? "—"}
              </Text>
            </View>
          </View>
        </Section>

        <Section title="Appearance">
          <ThemePicker preference={preference} onChange={handleSetTheme} />
        </Section>

        <Section title="Subscription">
          <ExternalLinkRow
            testID="settings-manage-subscription"
            label="Manage subscription on web"
            description="Opens scrollect.app in your browser."
            onPress={handleManageSubscription}
          />
        </Section>

        <Section title="Session">
          <Pressable
            testID="settings-sign-out"
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={handleSignOut}
            className="flex-row items-center gap-3 border border-neutral-200 bg-white px-5 py-4 active:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:active:bg-neutral-800"
          >
            <LogOut size={16} color={iconColor} />
            <Text className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              Sign out
            </Text>
          </Pressable>
        </Section>

        <Section title="Danger zone" tone="destructive">
          <Pressable
            testID="settings-delete-account"
            accessibilityRole="button"
            accessibilityLabel="Delete account on web"
            onPress={handleDeleteAccount}
            className="border border-red-500/30 bg-white px-5 py-4 active:bg-red-50 dark:border-red-500/40 dark:bg-neutral-900 dark:active:bg-red-950"
          >
            <Text className="text-sm font-medium" style={styles.destructiveText(destructiveColor)}>
              Delete account on web
            </Text>
            <Text className="mt-1 text-xs leading-4 text-neutral-500 dark:text-neutral-400">
              Permanently delete your account and all data. Opens scrollect.app in your browser.
            </Text>
          </Pressable>
        </Section>

        <View testID="settings-version-footer" className="items-center pt-6 pb-2">
          <Text className="text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-600">
            Scrollect v{appVersion}
            {buildVersion ? ` (${buildVersion})` : ""}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsHeader() {
  return (
    <View className="border-b border-neutral-200 bg-white px-5 pt-2 pb-4 dark:border-neutral-800 dark:bg-neutral-950">
      <Text className="text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Preferences
      </Text>
      <Text className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        Settings
      </Text>
    </View>
  );
}

interface SectionProps {
  title: string;
  tone?: "default" | "destructive";
  children: React.ReactNode;
}

function Section({ title, tone = "default", children }: SectionProps) {
  const titleClass =
    tone === "destructive"
      ? "text-sm font-semibold text-red-600 dark:text-red-400"
      : "text-sm font-semibold text-neutral-500 dark:text-neutral-400";
  return (
    <View className="mt-6 first:mt-0">
      <Text className={`mb-2 ${titleClass}`}>{title}</Text>
      {children}
    </View>
  );
}

interface ExternalLinkRowProps {
  testID: string;
  label: string;
  description: string;
  onPress: () => void;
}

function ExternalLinkRow({ testID, label, description, onPress }: ExternalLinkRowProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="border border-neutral-200 bg-white px-5 py-4 active:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:active:bg-neutral-800"
    >
      <Text className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{label}</Text>
      <Text className="mt-1 text-xs leading-4 text-neutral-500 dark:text-neutral-400">
        {description}
      </Text>
    </Pressable>
  );
}

const styles = {
  content: { paddingHorizontal: 20, paddingVertical: 16 } as const,
  destructiveText: (color: string) => ({ color }) as const,
};
