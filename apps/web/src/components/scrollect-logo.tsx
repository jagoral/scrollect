import { cn } from "@/lib/utils";
import LogoIcon from "@/assets/scrollect-logo.svg?react";
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
  style,
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  style?: React.CSSProperties;
}) {
  const px = sizeMap[size];
  return (
    <LogoIcon
      width={px}
      height={px}
      role="img"
      aria-label="Scrollect"
      className={cn("shrink-0", className)}
      style={style}
    />
  );
}

/**
 * Brand lockup: icon + "Scrollect" in Fraunces 600.
 * Use this for headers, navigation, and anywhere the brand text appears.
 */
export function ScrollectBrand({
  iconSize = "md",
  className,
  textClassName,
}: {
  iconSize?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <ScrollectLogo size={iconSize} />
      <span className={cn("font-logo text-lg font-semibold tracking-[-0.01em]", textClassName)}>
        Scrollect
      </span>
    </span>
  );
}
