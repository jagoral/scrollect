import { FileCode, FileText, Globe, Video } from "lucide-react";

import { cn } from "@/lib/utils";

export type DocumentThumbVariant = "spine" | "card" | "mini" | "hero";

interface DocumentThumbProps {
  documentId: string;
  title: string;
  fileType?: string;
  variant?: DocumentThumbVariant;
  className?: string;
}

export function DocumentThumb({
  documentId,
  title,
  fileType,
  variant = "spine",
  className,
}: DocumentThumbProps) {
  const hue = hashHue(documentId);
  const initials = getInitials(title);

  const style: React.CSSProperties = {
    backgroundImage: `linear-gradient(170deg, hsl(${hue} 40% 22%) 0%, hsl(${hue} 55% 14%) 55%, hsl(${hue} 60% 10%) 100%)`,
    borderColor: `hsl(${hue} 35% 28%)`,
    color: `hsl(${hue} 60% 88%)`,
  };

  const pattern: React.CSSProperties = {
    backgroundImage: `repeating-linear-gradient(180deg, transparent 0, transparent 5px, hsl(${hue} 20% 70% / 0.14) 5px, hsl(${hue} 20% 70% / 0.14) 6px)`,
  };

  if (variant === "mini") {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex h-5 w-4 shrink-0 items-center justify-center border font-logo text-[9px] font-medium leading-none",
          className,
        )}
        style={style}
      >
        {initials[0]}
      </span>
    );
  }

  if (variant === "hero") {
    return (
      <div
        className={cn(
          "relative flex size-full items-center justify-center overflow-hidden border",
          className,
        )}
        style={style}
        aria-hidden
      >
        <div className="absolute inset-0 opacity-40" style={pattern} />
        <div className="absolute inset-x-6 top-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] opacity-70">
          <span>{fileTypeShort(fileType)}</span>
          <span>Vol.</span>
        </div>
        <span className="relative z-10 font-logo text-[72px] font-semibold leading-none tracking-tight">
          {initials}
        </span>
        <div className="absolute inset-x-6 bottom-5 h-px bg-current opacity-25" />
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div
        className={cn(
          "relative flex h-20 w-14 shrink-0 flex-col items-center justify-between overflow-hidden border px-1 py-1.5",
          className,
        )}
        style={style}
        aria-hidden
      >
        <span className="font-mono text-[8px] uppercase tracking-[0.14em] opacity-70">
          {fileTypeShort(fileType)}
        </span>
        <span className="font-logo text-[20px] font-semibold leading-none">{initials}</span>
        <div className="h-[14px] w-full" style={pattern} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-16 w-[18px] shrink-0 flex-col items-center justify-between overflow-hidden border px-[3px] py-1",
        className,
      )}
      style={style}
      aria-hidden
      title={title}
    >
      <span className="font-logo text-[11px] font-semibold leading-none tracking-tight">
        {initials[0]}
      </span>
      <div className="h-full w-full" style={pattern} />
      <span className="font-mono text-[7px] uppercase leading-none opacity-70">
        {fileTypeShort(fileType)}
      </span>
    </div>
  );
}

export function ReadingProgress({
  pageStart,
  totalPages,
  className,
}: {
  pageStart: number | null | undefined;
  totalPages?: number | null;
  className?: string;
}) {
  if (pageStart == null) return null;

  if (totalPages == null) {
    return (
      <span
        className={cn("font-mono text-[9.5px] tracking-wide text-muted-foreground/70", className)}
      >
        p. {pageStart}
      </span>
    );
  }

  const pct = Math.min(100, Math.max(1, Math.round((pageStart / totalPages) * 100)));
  return (
    <div
      className={cn("flex w-24 flex-col gap-1", className)}
      aria-label={`Page ${pageStart} of ${totalPages}`}
    >
      <div className="h-[2px] w-full bg-border">
        <div className="h-[2px] bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between font-mono text-[9.5px] tracking-wide text-muted-foreground/70">
        <span>p. {pageStart}</span>
        <span>/ {totalPages}</span>
      </div>
    </div>
  );
}

export function FileTypeIcon({ fileType, className }: { fileType?: string; className?: string }) {
  const cls = cn("size-3.5 shrink-0", className);
  switch ((fileType ?? "").toLowerCase()) {
    case "url":
    case "article":
      return <Globe className={cls} />;
    case "youtube":
      return <Video className={cls} />;
    case "markdown":
    case "md":
      return <FileCode className={cls} />;
    default:
      return <FileText className={cls} />;
  }
}

function hashHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

function getInitials(title: string): string {
  const words = title
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^(the|a|an|of|and|in|on|for)$/i.test(w));
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function fileTypeShort(ft?: string): string {
  const f = (ft ?? "").toLowerCase();
  if (f === "youtube") return "YT";
  if (f === "markdown" || f === "md") return "MD";
  if (f === "article" || f === "url") return "WEB";
  if (f === "epub") return "EPB";
  if (f === "text" || f === "txt") return "TXT";
  return f.slice(0, 3).toUpperCase();
}
