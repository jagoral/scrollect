import type { ReactNode } from "react";
import { FileCode, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export const statusConfig = {
  uploaded: {
    label: "Uploaded",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    dotClassName: "bg-amber-500",
  },
  parsing: {
    label: "Parsing",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    dotClassName: "bg-blue-500 animate-pulse",
  },
  chunking: {
    label: "Chunking",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    dotClassName: "bg-blue-500 animate-pulse",
  },
  embedding: {
    label: "Embedding",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    dotClassName: "bg-blue-500 animate-pulse",
  },
  ready: {
    label: "Ready",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    dotClassName: "bg-emerald-500",
  },
  error: {
    label: "Error",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    dotClassName: "bg-red-500",
  },
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    dotClassName: "bg-amber-500",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    dotClassName: "bg-blue-500 animate-pulse",
  },
} as const;

export const fileTypeIcons: Record<string, ReactNode> = {
  pdf: <FileText className="h-4 w-4 text-muted-foreground" />,
  md: <FileCode className="h-4 w-4 text-muted-foreground" />,
};

export function StatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={config.className}>
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${config.dotClassName}`} />
      {config.label}
    </Badge>
  );
}
