import type { ReactNode } from "react";

import { Pressable, type PressableProps } from "@/tw";

const PRESS_HIT_SLOP = 8;

interface IconButtonProps extends Omit<PressableProps, "children"> {
  children: ReactNode;
  active?: boolean;
  tone?: "neutral" | "like" | "dislike" | "bookmark";
  className?: string;
}

const inactiveByTone = "bg-transparent active:bg-neutral-100 dark:active:bg-neutral-800";

const activeByTone: Record<NonNullable<IconButtonProps["tone"]>, string> = {
  neutral: "bg-neutral-100 dark:bg-neutral-800",
  like: "bg-emerald-50 dark:bg-emerald-950/40",
  dislike: "bg-red-50 dark:bg-red-950/40",
  bookmark: "bg-neutral-900/5 dark:bg-neutral-100/10",
};

export function IconButton({
  children,
  active = false,
  tone = "neutral",
  className,
  accessibilityRole,
  ...rest
}: IconButtonProps) {
  const stateClass = active ? activeByTone[tone] : inactiveByTone;
  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityState={{ selected: active, disabled: !!rest.disabled }}
      hitSlop={PRESS_HIT_SLOP}
      className={`size-11 items-center justify-center rounded-full ${stateClass}${
        className ? ` ${className}` : ""
      }`}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
