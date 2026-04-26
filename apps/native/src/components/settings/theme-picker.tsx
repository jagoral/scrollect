import { Check } from "lucide-react-native";

import { useThemeColor } from "@/lib/theme/colors";
import type { ThemePreference } from "@/lib/theme/storage";
import { Pressable, Text, View } from "@/tw";

interface ThemePickerProps {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void | Promise<void>;
}

const OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  { value: "system", label: "System", description: "Match your device" },
  { value: "light", label: "Light", description: "Always light" },
  { value: "dark", label: "Dark", description: "Always dark" },
];

export function ThemePicker({ preference, onChange }: ThemePickerProps) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Theme"
      className="border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      {OPTIONS.map((option, index) => (
        <ThemeOption
          key={option.value}
          option={option}
          selected={preference === option.value}
          isFirst={index === 0}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

interface ThemeOptionProps {
  option: { value: ThemePreference; label: string; description: string };
  selected: boolean;
  isFirst: boolean;
  onPress: () => void;
}

function ThemeOption({ option, selected, isFirst, onPress }: ThemeOptionProps) {
  const checkColor = useThemeColor("foreground");
  const borderClass = isFirst ? "" : "border-t border-neutral-200 dark:border-neutral-800";

  return (
    <Pressable
      testID={`theme-option-${option.value}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
      onPress={onPress}
      className={`flex-row items-center justify-between gap-3 px-5 py-3 active:bg-neutral-100 dark:active:bg-neutral-800 ${borderClass}`}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          {option.label}
        </Text>
        <Text className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {option.description}
        </Text>
      </View>
      {selected ? <Check size={18} color={checkColor} /> : null}
    </Pressable>
  );
}
