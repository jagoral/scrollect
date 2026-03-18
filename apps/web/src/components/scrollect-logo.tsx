import { cn } from "@/lib/utils";
import LogoIcon from "@/assets/scrollect-logo.svg?react";
import WordmarkBase from "@/assets/scrollect-wordmark.svg?react";
import WordmarkWithSubline from "@/assets/scrollect-wordmark-with-subline.svg?react";

const sizeMap = {
  xs: 20,
  sm: 24,
  md: 28,
  lg: 40,
  xl: 64,
};

/**
 * Scrollect logo mark — the icon extracted from the brand SVG.
 * Uses currentColor so it inherits text color automatically.
 */
export function ScrollectLogo({
  size = "md",
  className,
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const px = sizeMap[size];
  return (
    <LogoIcon
      width={px}
      height={px}
      role="img"
      aria-label="Scrollect"
      className={cn("shrink-0", className)}
    />
  );
}

/**
 * Full Scrollect logo with icon + "SCROLLECT" wordmark.
 * Optional subline (tagline) below the wordmark.
 */
export function ScrollectWordmark({
  height = 32,
  showSubline = false,
  className,
}: {
  height?: number;
  showSubline?: boolean;
  className?: string;
}) {
  const Svg = showSubline ? WordmarkWithSubline : WordmarkBase;
  return (
    <Svg
      height={height}
      role="img"
      aria-label="Scrollect"
      className={cn("shrink-0", className)}
    />
  );
}
