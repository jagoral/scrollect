import { Redirect } from "expo-router";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth-client";
import { useThemeColor } from "@/lib/theme/colors";
import { ActivityIndicator, View } from "@/tw";

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Gate a route on a resolved Better-Auth session. Renders a centered spinner
 * while the session is loading and redirects to /sign-in when no session
 * exists. Centralized here so multiple route layers (the tabs layout and any
 * stack-pushed routes outside the tab group) stay in lock-step if the auth
 * check changes.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const session = authClient.useSession();
  const spinnerColor = useThemeColor("foreground");

  if (session.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator color={spinnerColor} />
      </View>
    );
  }

  if (!session.data) {
    return <Redirect href="/sign-in" />;
  }

  return <>{children}</>;
}
