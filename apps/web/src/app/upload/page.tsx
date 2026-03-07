"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useMutation } from "convex/react";
import { Loader2, Upload } from "lucide-react";
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
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Upload Content</h1>
      <p className="mt-2 text-muted-foreground">Add PDF or Markdown files to your library.</p>

      <Card
        className={`mt-6 flex min-h-[300px] cursor-pointer flex-col items-center justify-center gap-4 border-2 border-dashed p-8 transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-10 w-10 text-muted-foreground" />
        <div className="text-center">
          <p className="text-lg font-medium">Drag & drop files here</p>
          <p className="text-sm text-muted-foreground">or click to choose files</p>
          <p className="mt-2 text-xs text-muted-foreground">Accepts .pdf and .md files</p>
        </div>
        <Button
          variant="outline"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          Choose files
        </Button>
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
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
        </div>
      </AuthLoading>
    </>
  );
}
