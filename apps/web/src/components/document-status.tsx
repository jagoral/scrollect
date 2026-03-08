import { FileCode, FileText } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export const statusConfig = {
  uploaded: {
    label: "Uploaded",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    dotColor: "bg-amber-500",
    pulse: false,
  },
  parsing: {
    label: "Parsing",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    dotColor: "bg-blue-500",
    pulse: true,
  },
  chunking: {
    label: "Chunking",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    dotColor: "bg-blue-500",
    pulse: true,
  },
  embedding: {
    label: "Embedding",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    dotColor: "bg-blue-500",
    pulse: true,
  },
  ready: {
    label: "Ready",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    dotColor: "bg-emerald-500",
    pulse: false,
  },
  error: {
    label: "Error",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    dotColor: "bg-red-500",
    pulse: false,
  },
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    dotColor: "bg-amber-500",
    pulse: false,
  },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    dotColor: "bg-blue-500",
    pulse: true,
  },
} as const;

export function StatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${config.dotColor} ${config.pulse ? "animate-pulse" : ""}`}
      />
      {config.label}
    </Badge>
  );
}

export const fileTypeIcons: Record<string, ReactNode> = {
  pdf: <FileText className="h-4.5 w-4.5 text-red-500" />,
  md: <FileCode className="h-4.5 w-4.5 text-blue-500" />,
};

export function FileTypeIcon({ fileType }: { fileType: string }) {
  return (
    <span className="flex shrink-0 items-center">
      {fileTypeIcons[fileType] ?? <FileText className="h-4.5 w-4.5 text-muted-foreground" />}
    </span>
  );
}
