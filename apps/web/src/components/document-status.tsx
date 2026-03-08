import { Badge } from "@/components/ui/badge";

export const statusConfig = {
  uploaded: {
    label: "Uploaded",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  parsing: {
    label: "Parsing",
    className: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900/30 dark:text-blue-400",
  },
  chunking: {
    label: "Chunking",
    className: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900/30 dark:text-blue-400",
  },
  embedding: {
    label: "Embedding",
    className: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900/30 dark:text-blue-400",
  },
  ready: {
    label: "Ready",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  error: {
    label: "Error",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900/30 dark:text-blue-400",
  },
} as const;

export const fileTypeIcons: Record<string, string> = {
  pdf: "\u{1F4C4}",
  md: "\u{1F4DD}",
};

export function StatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
