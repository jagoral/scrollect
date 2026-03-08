import { cn } from "@/lib/utils";

const sizes = {
  xs: { icon: 20, text: "text-sm" },
  sm: { icon: 24, text: "text-base" },
  md: { icon: 28, text: "text-lg" },
  lg: { icon: 40, text: "text-2xl" },
  xl: { icon: 64, text: "text-4xl" },
} as const;

interface ScrollectLogoProps {
  size?: keyof typeof sizes;
  showText?: boolean;
  className?: string;
}

export function ScrollectLogo({ size = "md", showText = false, className }: ScrollectLogoProps) {
  const { icon, text } = sizes[size];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 32 32"
        fill="none"
        role="img"
        aria-label="Scrollect logo"
        className="shrink-0"
      >
        {/* Back card — offset, lighter */}
        <rect x="6" y="4" width="20" height="14" rx="3.5" fill="currentColor" opacity="0.25" />
        {/* Front card — overlapping, solid */}
        <rect x="6" y="14" width="20" height="14" rx="3.5" fill="currentColor" opacity="0.85" />
        {/* Accent line on front card */}
        <rect x="10" y="19" width="12" height="1.5" rx="0.75" fill="currentColor" opacity="0.35" />
        <rect x="10" y="23" width="8" height="1.5" rx="0.75" fill="currentColor" opacity="0.2" />
      </svg>
      {showText && <span className={cn("font-bold tracking-tight", text)}>Scrollect</span>}
    </span>
  );
}
