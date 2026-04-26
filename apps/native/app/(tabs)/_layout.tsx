import { Tabs } from "expo-router";
import { Bookmark, Folder, Home, Settings as SettingsIcon } from "lucide-react-native";

import { AuthGuard } from "@/components/auth-guard";
import { useThemeColors } from "@/lib/theme/colors";

export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <AuthGuard>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: colors.foreground,
          tabBarInactiveTintColor: colors.mutedForeground,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        }}
      >
        <Tabs.Screen
          name="feed"
          options={{
            title: "Feed",
            tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="saved"
          options={{
            title: "Saved",
            tabBarIcon: ({ color, size }) => <Bookmark size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="topics"
          options={{
            title: "Topics",
            tabBarIcon: ({ color, size }) => <Folder size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => <SettingsIcon size={size} color={color} />,
          }}
        />
      </Tabs>
    </AuthGuard>
  );
}
