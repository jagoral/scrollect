import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Appearance, type ColorSchemeName } from "react-native";

import { loadThemePreference, saveThemePreference, type ThemePreference } from "./storage";

type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyAppearance(preference: ThemePreference) {
  // "unspecified" tells RN's Appearance to clear any override and follow the
  // OS — react-native-css's internal listener picks the change up automatically
  // because it subscribes to Appearance.addChangeListener.
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
}

function resolve(
  preference: ThemePreference,
  system: ColorSchemeName | null | undefined,
): ResolvedTheme {
  if (preference === "system") return system === "dark" ? "dark" : "light";
  return preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName | null | undefined>(() =>
    Appearance.getColorScheme(),
  );
  // `hydrated` gates the first paint on the AsyncStorage read so the app
  // doesn't flash from "system" colors to the user's stored preference. The
  // alternative — always render — produced a visible snap on cold start when
  // a user had explicitly chosen Light/Dark on a phone in the opposite mode.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadThemePreference()
      .then((stored) => {
        if (cancelled) return;
        setPreferenceState(stored);
        applyAppearance(stored);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Track the OS-reported color scheme separately so we can resolve to a
  // concrete light/dark value while the preference is "system".
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    applyAppearance(next);
    await saveThemePreference(next);
  }, []);

  const resolved = useMemo(() => resolve(preference, systemScheme), [preference, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  // The empty render is the natural splash before the first paint — the
  // window-level background color (set by app.json `userInterfaceStyle:
  // "automatic"`) bridges the gap so the user sees a flat surface, not a
  // mismatched light flash.
  if (!hydrated) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
