import type { ReactNode } from "react";

import { useThemeColor } from "@/lib/theme/colors";
import { ActivityIndicator, Pressable, Text, type PressableProps } from "@/tw";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "default" | "sm";

interface ButtonProps extends Omit<PressableProps, "children"> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-neutral-900 dark:bg-neutral-100 active:opacity-90 disabled:opacity-50",
  secondary:
    "border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900 active:opacity-90 disabled:opacity-50",
  ghost: "active:opacity-70 disabled:opacity-50",
};

const variantTextClass: Record<ButtonVariant, string> = {
  primary: "text-white dark:text-neutral-900",
  secondary: "text-neutral-900 dark:text-neutral-50",
  ghost: "text-neutral-900 dark:text-neutral-50",
};

const sizeClass: Record<ButtonSize, string> = {
  default: "px-4 py-3",
  sm: "px-3 py-2",
};

export function Button({
  children,
  variant = "primary",
  size = "default",
  loading,
  disabled,
  className,
  accessibilityRole,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const indicatorColor = useThemeColor(variant === "primary" ? "surface" : "foreground");
  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      className={`flex-row items-center justify-center rounded-md ${variantClass[variant]} ${sizeClass[size]}${
        className ? ` ${className}` : ""
      }`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={indicatorColor} />
      ) : typeof children === "string" ? (
        <Text className={`text-base font-medium ${variantTextClass[variant]}`}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
