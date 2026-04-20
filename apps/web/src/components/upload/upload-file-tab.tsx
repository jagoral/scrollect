import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { formatFileSize, getFileSizeLimits } from "@scrollect/backend/src/platform/fileSizeLimits";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { CheckCircle2, CloudUpload, FileUp, Loader2, XCircle } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { LearningGoalOnboardingPrompt } from "@/components/upload/learning-goal-onboarding-dialog";
import { useUploadErrorHandler } from "@/components/upload/upload-error-provider";
import { useBilling } from "@/hooks/use-billing";
import { cn } from "@/lib/utils";

const UPLOAD_FILE_TYPES = ["pdf", "epub", "md"] as const;
type UploadFileType = (typeof UPLOAD_FILE_TYPES)[number];

export const ACCEPTED_TYPES = new Set<string>(UPLOAD_FILE_TYPES);

export function getFileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isUploadFileType(ext: string): ext is UploadFileType {
  return ACCEPTED_TYPES.has(ext);
}

export interface FileUploadState {
  file: File;
  status: "uploading" | "done" | "error";
}

type UploadFileTabProps = {
  onDocumentCreated: (prompt: LearningGoalOnboardingPrompt) => void;
};

export function UploadFileTab({ onDocumentCreated }: UploadFileTabProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<FileUploadState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posthog = usePostHog();
  const handleUploadError = useUploadErrorHandler();
  const { usage } = useBilling();
  const fileSizeLimits = getFileSizeLimits(usage?.tier ?? "free");

  const generateUploadUrl = useMutation(api.content.documents.generateUploadUrl);
  const createDocument = useMutation(api.content.documents.create);

  const isUploading = uploads.some((u) => u.status === "uploading");

  const uploadFile = useCallback(
    async (file: File) => {
      const ext = getFileExtension(file.name);
      if (!isUploadFileType(ext)) {
        toast.error(
          `Unsupported file type: .${ext}. Only .pdf, .epub, and .md files are accepted.`,
        );
        return;
      }

      if (file.size === 0) {
        toast.error(`File "${file.name}" is empty.`);
        return;
      }

      const sizeLimit = fileSizeLimits[ext];
      if (file.size > sizeLimit) {
        toast.error(
          `File too large (${formatFileSize(file.size)}). Maximum for .${ext} files is ${formatFileSize(sizeLimit)}.`,
        );
        return;
      }

      setUploads((prev) => [...prev, { file, status: "uploading" }]);

      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });

        if (!result.ok) {
          throw new Error(`Upload failed: ${result.statusText}`);
        }

        const { storageId } = (await result.json()) as { storageId: string };

        const title = file.name.replace(/\.[^.]+$/, "");
        const documentId = (await createDocument({
          title,
          fileType: ext,
          storageId: storageId as never,
        })) as Id<"documents">;

        setUploads((prev) =>
          prev.map((u) => (u.file === file ? { ...u, status: "done" as const } : u)),
        );
        onDocumentCreated({ documentId, documentTitle: title, sourceType: ext });
        posthog.capture("content.uploaded", {
          source_type: ext,
          file_size: file.size,
        });
        toast.success(
          <span>
            <strong>{file.name}</strong> uploaded! Processing typically takes 3-5 minutes and
            continues in the background. Add a learning goal now so posts use it.{" "}
            <Link to="/app/library" className="underline">
              View in library
            </Link>
          </span>,
        );
      } catch (error) {
        setUploads((prev) =>
          prev.map((u) => (u.file === file ? { ...u, status: "error" as const } : u)),
        );
        posthog.captureException(error);
        handleUploadError(error, `Failed to upload ${file.name}`);
      }
    },
    [
      generateUploadUrl,
      createDocument,
      posthog,
      handleUploadError,
      fileSizeLimits,
      onDocumentCreated,
    ],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        uploadFile(file);
      }
    },
    [uploadFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (isUploading) return;
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles, isUploading],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (isUploading) {
        e.dataTransfer.dropEffect = "none";
        return;
      }
      setDragOver(true);
    },
    [isUploading],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const activeUploads = uploads.filter((u) => u.status === "uploading");
  const settledUploads = uploads.filter((u) => u.status === "done" || u.status === "error");

  const openFileDialog = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  return (
    <div>
      <div
        data-testid="file-drop-zone"
        role="button"
        tabIndex={isUploading ? -1 : 0}
        aria-disabled={isUploading}
        onKeyDown={(e) => {
          if (isUploading) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openFileDialog();
          }
        }}
        className={cn(
          "group relative flex min-h-[340px] flex-col items-center justify-center gap-6 overflow-hidden border border-dashed px-8 py-12 transition-all",
          isUploading
            ? "cursor-not-allowed border-border/60 bg-muted/30 opacity-70"
            : "cursor-pointer",
          !isUploading && dragOver
            ? "border-primary bg-primary/5"
            : !isUploading &&
                "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30",
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFileDialog}
      >
        <Corner position="tl" active={dragOver && !isUploading} />
        <Corner position="tr" active={dragOver && !isUploading} />
        <Corner position="bl" active={dragOver && !isUploading} />
        <Corner position="br" active={dragOver && !isUploading} />

        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "inline-block size-1.5 rounded-full transition-colors",
              isUploading ? "bg-muted-foreground/40" : dragOver ? "bg-primary" : "bg-primary/60",
            )}
          />
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.32em] text-muted-foreground">
            {isUploading ? "Upload In Progress" : "Drop Zone"}
          </span>
        </div>

        <div
          className={cn(
            "relative flex size-16 items-center justify-center border transition-colors",
            isUploading
              ? "border-muted-foreground/30 text-muted-foreground/50"
              : dragOver
                ? "border-primary/30 text-primary"
                : "border-border text-muted-foreground group-hover:border-primary/40 group-hover:text-primary",
          )}
        >
          {isUploading ? (
            <Loader2 className="size-7 animate-spin" />
          ) : (
            <CloudUpload className={cn("size-7", dragOver && "animate-float")} />
          )}
        </div>

        <div className="text-center">
          <p className="font-logo text-2xl font-semibold tracking-tight md:text-3xl">
            {isUploading
              ? "Hold tight, uploading..."
              : dragOver
                ? "Release to upload"
                : "Drop your files here"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {isUploading
              ? "Finish the current upload before adding more files."
              : "or click anywhere in this area to browse"}
          </p>
        </div>

        <Button
          variant="outline"
          type="button"
          size="sm"
          disabled={isUploading}
          onClick={(e) => {
            e.stopPropagation();
            openFileDialog();
          }}
        >
          <FileUp data-icon="inline-start" />
          Choose files
        </Button>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          <FormatChip ext="pdf" limit={fileSizeLimits.pdf} />
          <FormatChip ext="epub" limit={fileSizeLimits.epub} />
          <FormatChip ext="md" limit={fileSizeLimits.md} />
        </div>

        <input
          ref={fileInputRef}
          data-testid="file-input"
          type="file"
          accept=".pdf,.epub,.md"
          multiple
          disabled={isUploading}
          className="hidden"
          onChange={(e) => {
            if (e.target.files && !isUploading) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {activeUploads.length > 0 && (
        <div className="mt-4 flex items-center gap-3 border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Loader2 className="size-4 animate-spin" />
          <span className="font-medium">
            Uploading {activeUploads.length} file{activeUploads.length > 1 ? "s" : ""}
          </span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.22em] opacity-70">
            Locked
          </span>
        </div>
      )}

      {settledUploads.length > 0 && (
        <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {settledUploads.map((u) => (
            <div
              key={u.file.name + u.file.lastModified}
              className={cn(
                "flex items-center gap-2.5 border px-4 py-3 text-sm",
                u.status === "done"
                  ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "border-destructive/30 text-destructive",
              )}
            >
              {u.status === "done" ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <XCircle className="size-4 shrink-0" />
              )}
              <span className="min-w-0 truncate font-medium">{u.file.name}</span>
              {u.status === "done" && (
                <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] opacity-70">
                  Processing
                </span>
              )}
              {u.status === "error" && (
                <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] opacity-70">
                  Failed
                </span>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between px-1 pt-1">
            <p className="text-xs text-muted-foreground">
              You can upload more files, navigate away, or close the app.
            </p>
            <Link
              to="/app/library"
              className="text-xs font-medium text-primary underline underline-offset-2"
            >
              View in library
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function FormatChip({ ext, limit }: { ext: string; limit: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-foreground/70">.{ext}</span>
      <span className="text-muted-foreground/50">≤ {formatFileSize(limit)}</span>
    </span>
  );
}

function Corner({ position, active }: { position: "tl" | "tr" | "bl" | "br"; active: boolean }) {
  const positions = {
    tl: "left-2 top-2 border-l border-t",
    tr: "right-2 top-2 border-r border-t",
    bl: "left-2 bottom-2 border-l border-b",
    br: "right-2 bottom-2 border-r border-b",
  } as const;
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute size-4 transition-colors",
        positions[position],
        active ? "border-primary" : "border-transparent",
      )}
    />
  );
}
