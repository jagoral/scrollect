import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type PushPermissionStatus = "granted" | "denied" | "undetermined";

export interface PushTokenInfo {
  token: string;
  platform: "ios" | "android";
}

const ANDROID_DEFAULT_CHANNEL = "default";

/**
 * Configure foreground notification behaviour and the default Android channel.
 * Idempotent - safe to call on every mount. iOS doesn't use channels but still
 * needs the handler so a notification that lands while the app is open shows a
 * banner instead of being silently dropped.
 */
export async function setupNotificationHandler(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL, {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

export async function requestPushPermission(): Promise<PushPermissionStatus> {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

/**
 * Fetches the Expo push token for this device. Returns null on simulators (where
 * push doesn't work) and on any other failure - callers should treat null as "no
 * token to register" rather than as an error to surface to the user.
 */
export async function fetchExpoPushToken(): Promise<PushTokenInfo | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL, {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

  if (!projectId) {
    console.warn("[push] No EAS projectId configured; cannot mint Expo push token.");
    return null;
  }

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!result.data) return null;
    const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";
    return { token: result.data, platform };
  } catch (error) {
    console.warn("[push] getExpoPushTokenAsync failed", error);
    return null;
  }
}
