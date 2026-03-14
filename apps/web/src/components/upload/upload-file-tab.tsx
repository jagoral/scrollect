import { api } from "@scrollect/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { CloudUpload, FileUp, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const ACCEPTED_TYPES = new Set(["pdf", "md"]);

export function getFileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export interface FileUploadState {
  file: File;
  status: "uploading" | "done" | "error";
}

export function UploadFileTab() {
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<FileUploadState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.create);

  const uploadFile = useCallback(
    async (file: File) => {
      const ext = getFileExtension(file.name);
      if (!ACCEPTED_TYPES.has(ext)) {
        toast.error(`Unsupported file type: .${ext}. Only .pdf and .md files are accepted.`);
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
        await createDocument({
          title,
          fileType: ext as "pdf" | "md",
          storageId: storageId as never,
        });

        setUploads((prev) =>
          prev.map((u) => (u.file === file ? { ...u, status: "done" as const } : u)),
        );
        toast.success(
          <span>
            Uploaded <strong>{file.name}</strong>.{" "}
            <a href="/library" className="underline">
              View in library
            </a>
          </span>,
        );
      } catch {
        setUploads((prev) =>
          prev.map((u) => (u.file === file ? { ...u, status: "error" as const } : u)),
        );
        toast.error(`Failed to upload ${file.name}`);
      }
    },
    [generateUploadUrl, createDocument],
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

  return (
    <>
      <Card
        data-testid="file-drop-zone"
        className={`group relative flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden rounded-xl border-2 border-dashed p-8 transition-all ${
          dragOver
            ? "scale-[1.01] border-primary bg-primary/5 shadow-lg shadow-primary/10"
            : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--color-muted-foreground) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div
          className={`relative flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${
            dragOver
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
          }`}
        >
          <CloudUpload className={`h-8 w-8 ${dragOver ? "animate-bounce" : ""}`} />
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
          <FileUp className="mr-2 h-4 w-4" />
          Choose files
        </Button>
        <p className="text-xs text-muted-foreground">Accepts .pdf and .md files</p>
        <input
          ref={fileInputRef}
          data-testid="file-input"
          type="file"
          accept=".pdf,.md"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </Card>

      {activeUploads.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-primary/5 px-4 py-3 text-sm text-primary animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading {activeUploads.length} file{activeUploads.length > 1 ? "s" : ""}...
        </div>
      )}
    </>
  );
}
