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
import { Card } from "@/components/ui/card";
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
            continues in the background. Add a learning goal now so cards use it.{" "}
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
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const activeUploads = uploads.filter((u) => u.status === "uploading");
  const settledUploads = uploads.filter((u) => u.status === "done" || u.status === "error");

  return (
    <>
      <Card
        data-testid="file-drop-zone"
        className={cn(
          "group relative flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden border-2 border-dashed p-8 transition-all",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30",
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <div
          className={cn(
            "relative flex size-16 items-center justify-center border transition-colors",
            dragOver
              ? "border-primary/30 text-primary"
              : "border-border text-muted-foreground group-hover:border-primary/30 group-hover:text-primary",
          )}
        >
          <CloudUpload className={cn("size-8", dragOver && "animate-float")} />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold">
            {dragOver ? "Drop your files here" : "Drag & drop files here"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">or click to browse your computer</p>
        </div>
        <Button
          variant="outline"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          <FileUp data-icon="inline-start" />
          Choose files
        </Button>
        <p className="text-xs text-muted-foreground">
          Accepts .pdf (max {formatFileSize(fileSizeLimits.pdf)}), .epub (max{" "}
          {formatFileSize(fileSizeLimits.epub)}), and .md (max {formatFileSize(fileSizeLimits.md)})
        </p>
        <input
          ref={fileInputRef}
          data-testid="file-input"
          type="file"
          accept=".pdf,.epub,.md"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </Card>

      {activeUploads.length > 0 && (
        <div className="mt-4 flex items-center gap-2 border border-primary/30 px-4 py-3 text-sm text-primary animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Loader2 className="size-4 animate-spin" />
          Uploading {activeUploads.length} file{activeUploads.length > 1 ? "s" : ""}...
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
                <span className="ml-auto shrink-0 text-xs opacity-70">
                  Processing in background
                </span>
              )}
              {u.status === "error" && (
                <span className="ml-auto shrink-0 text-xs opacity-70">Upload failed</span>
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
    </>
  );
}
