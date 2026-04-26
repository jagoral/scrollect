import { useTheme } from "./theme-context";

interface ThemeColorPalette {
  foreground: string;
  mutedForeground: string;
  subtleForeground: string;
  surface: string;
  border: string;
  destructive: string;
  warning: string;
  success: string;
  successForeground: string;
  bookmark: string;
  accent: string;
}

export const lightColors: ThemeColorPalette = {
  foreground: "#171717",
  mutedForeground: "#737373",
  subtleForeground: "#a3a3a3",
  surface: "#ffffff",
  border: "#e5e5e5",
  destructive: "#dc2626",
  warning: "#ef4444",
  success: "#059669",
  successForeground: "#047857",
  bookmark: "#171717",
  accent: "#8b5cf6",
};

export const darkColors: ThemeColorPalette = {
  foreground: "#fafafa",
  mutedForeground: "#a3a3a3",
  subtleForeground: "#737373",
  surface: "#0a0a0a",
  border: "#262626",
  destructive: "#f87171",
  warning: "#f87171",
  success: "#34d399",
  successForeground: "#34d399",
  bookmark: "#fafafa",
  accent: "#c4b5fd",
};

export type ThemeColorKey = keyof ThemeColorPalette;

export function useThemeColors() {
  const { resolved } = useTheme();
  return resolved === "dark" ? darkColors : lightColors;
}

export function useThemeColor(key: ThemeColorKey) {
  return useThemeColors()[key];
}
