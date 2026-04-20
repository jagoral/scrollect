import type { ReactNode } from "react";
import { BookOpen, FileCode, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export const statusConfig = {
  uploaded: {
    label: "Uploaded",
    className: "rounded-none border-amber-500/30 bg-transparent text-amber-600 dark:text-amber-400",
    dotClassName: "bg-amber-500",
  },
  parsing: {
    label: "Parsing",
    className: "rounded-none border-blue-500/30 bg-transparent text-blue-600 dark:text-blue-400",
    dotClassName: "bg-blue-500 animate-pulse",
  },
  chunking: {
    label: "Chunking",
    className: "rounded-none border-blue-500/30 bg-transparent text-blue-600 dark:text-blue-400",
    dotClassName: "bg-blue-500 animate-pulse",
  },
  embedding: {
    label: "Embedding",
    className: "rounded-none border-blue-500/30 bg-transparent text-blue-600 dark:text-blue-400",
    dotClassName: "bg-blue-500 animate-pulse",
  },
  summarizing: {
    label: "Summarizing",
    className:
      "rounded-none border-violet-500/30 bg-transparent text-violet-600 dark:text-violet-400",
    dotClassName: "bg-violet-500 animate-pulse",
  },
  generating_cards: {
    label: "Generating Posts",
    className:
      "rounded-none border-violet-500/30 bg-transparent text-violet-600 dark:text-violet-400",
    dotClassName: "bg-violet-500 animate-pulse",
  },
  ready: {
    label: "Ready",
    className:
      "rounded-none border-emerald-500/30 bg-transparent text-emerald-600 dark:text-emerald-400",
    dotClassName: "bg-emerald-500",
  },
  deleting: {
    label: "Deleting",
    className: "rounded-none border-red-500/30 bg-transparent text-red-600 dark:text-red-400",
    dotClassName: "bg-red-500 animate-pulse",
  },
  error: {
    label: "Error",
    className: "rounded-none border-red-500/30 bg-transparent text-red-600 dark:text-red-400",
    dotClassName: "bg-red-500",
  },
  pending: {
    label: "Pending",
    className: "rounded-none border-amber-500/30 bg-transparent text-amber-600 dark:text-amber-400",
    dotClassName: "bg-amber-500",
  },
  processing: {
    label: "Processing",
    className: "rounded-none border-blue-500/30 bg-transparent text-blue-600 dark:text-blue-400",
    dotClassName: "bg-blue-500 animate-pulse",
  },
} as const;

export const fileTypeIcons: Record<string, ReactNode> = {
  pdf: <FileText className="h-4 w-4 text-muted-foreground" />,
  epub: <BookOpen className="h-4 w-4 text-muted-foreground" />,
  md: <FileCode className="h-4 w-4 text-muted-foreground" />,
};

export function StatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={config.className} data-testid={`status-${status}`}>
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${config.dotClassName}`} />
      {config.label}
    </Badge>
  );
}
