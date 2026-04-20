import type { LucideIcon } from "lucide-react";
import { BookOpen, FileCode, FileText, Globe, Video } from "lucide-react";

interface FileTypeEntry {
  Icon: LucideIcon;
  label: string;
}

const FILE_TYPE_CONFIG: Record<string, FileTypeEntry> = {
  pdf: { Icon: FileText, label: "PDF" },
  epub: { Icon: BookOpen, label: "Book" },
  md: { Icon: FileCode, label: "Markdown" },
  markdown: { Icon: FileCode, label: "Markdown" },
  article: { Icon: Globe, label: "Article" },
  youtube: { Icon: Video, label: "YouTube" },
  text: { Icon: FileText, label: "Text" },
};

const DEFAULT_ENTRY: FileTypeEntry = { Icon: FileText, label: "Document" };

export function getFileTypeConfig(fileType?: string): FileTypeEntry {
  return FILE_TYPE_CONFIG[fileType ?? ""] ?? DEFAULT_ENTRY;
}
