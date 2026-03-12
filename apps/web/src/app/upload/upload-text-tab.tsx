"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function UploadTextTab() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [textTouched, setTextTouched] = useState(false);

  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createFromText = useMutation(api.documents.createFromText);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedText = text.trim();
      const trimmedTitle = title.trim();

      if (!trimmedText) {
        toast.error("Please enter some text content.");
        return;
      }
      if (!trimmedTitle) {
        toast.error("Please enter a title.");
        return;
      }

      setSubmitting(true);
      try {
        // Upload text as a blob to Convex storage
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "text/markdown" },
          body: trimmedText,
        });

        if (!result.ok) {
          throw new Error(`Upload failed: ${result.statusText}`);
        }

        const { storageId } = (await result.json()) as { storageId: string };

        await createFromText({
          title: trimmedTitle,
          storageId: storageId as never,
        });

        setTitle("");
        setText("");
        setTitleTouched(false);
        setTextTouched(false);
        toast.success(
          <span>
            Added <strong>{trimmedTitle}</strong>.{" "}
            <Link href="/library" className="underline">
              View in library
            </Link>
          </span>,
        );
      } catch {
        toast.error("Something went wrong while saving your text. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [title, text, generateUploadUrl, createFromText],
  );

  return (
    <Card className="rounded-xl border-2 border-muted-foreground/20 p-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <FileText className="h-8 w-8" />
          </div>
          <div>
            <p className="text-lg font-semibold">Paste Text</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste any text to add it to your library.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="text-title">Title</Label>
          <Input
            id="text-title"
            data-testid="text-title-input"
            placeholder="e.g., Meeting notes, Research summary"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTitleTouched(true)}
            disabled={submitting}
          />
          {titleTouched && !title.trim() && (
            <p className="text-sm text-destructive">Title is required</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="text-content">Content</Label>
          <Textarea
            id="text-content"
            data-testid="text-content-input"
            placeholder="Paste your text, notes, or any content here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => setTextTouched(true)}
            disabled={submitting}
            rows={6}
            className="resize-y"
          />
          {textTouched && !text.trim() && (
            <p className="text-sm text-destructive">Text content is required</p>
          )}
          {text.trim() && (
            <p className="text-xs text-muted-foreground">
              {text.trim().length.toLocaleString()} characters
            </p>
          )}
        </div>

        <Button
          data-testid="text-submit"
          type="submit"
          disabled={submitting || !text.trim() || !title.trim()}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Add to Library"
          )}
        </Button>
      </form>
    </Card>
  );
}
