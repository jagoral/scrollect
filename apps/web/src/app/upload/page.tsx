"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useMutation } from "convex/react";
import { CloudUpload, FileUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ACCEPTED_TYPES = new Set(["pdf", "md"]);

function getFileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

interface FileUploadState {
  file: File;
  status: "uploading" | "done" | "error";
}

function UploadContent() {
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
            <Link href="/library" className="underline">
              View in library
            </Link>
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
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Upload Content</h1>
        <p className="mt-1 text-muted-foreground">Add PDF or Markdown files to your library.</p>
      </div>

      <Card
        className={`group relative flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden rounded-xl border-2 border-dashed p-8 transition-all duration-200 ${
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
        {/* Dot-grid background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--color-muted-foreground) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
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
        <div className="relative text-center">
          <p className="text-lg font-semibold">
            {dragOver ? "Drop your files here" : "Drag & drop files here"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">or click to browse your computer</p>
        </div>
        <Button
          variant="outline"
          type="button"
          className="relative"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          <FileUp className="mr-2 h-4 w-4" />
          Choose files
        </Button>
        <p className="relative text-xs text-muted-foreground">Accepts .pdf and .md files</p>
        <input
          ref={fileInputRef}
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
        <div className="mt-4 flex animate-in fade-in items-center gap-2 rounded-lg bg-primary/5 px-4 py-3 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading {activeUploads.length} file{activeUploads.length > 1 ? "s" : ""}...
        </div>
      )}
    </div>
  );
}

function UnauthenticatedRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signin");
  }, [router]);
  return null;
}

export default function UploadPage() {
  return (
    <>
      <Authenticated>
        <UploadContent />
      </Authenticated>
      <Unauthenticated>
        <UnauthenticatedRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </AuthLoading>
    </>
  );
}
