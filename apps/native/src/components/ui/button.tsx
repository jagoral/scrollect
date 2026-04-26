import type { ReactNode } from "react";

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
  primary: "bg-neutral-900 active:opacity-90 disabled:opacity-50",
  secondary: "border border-neutral-300 bg-white active:opacity-90 disabled:opacity-50",
  ghost: "active:opacity-70 disabled:opacity-50",
};

const variantTextClass: Record<ButtonVariant, string> = {
  primary: "text-white",
  secondary: "text-neutral-900",
  ghost: "text-neutral-900",
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
        <ActivityIndicator color={variant === "primary" ? "#ffffff" : "#171717"} />
      ) : typeof children === "string" ? (
        <Text className={`text-base font-medium ${variantTextClass[variant]}`}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
