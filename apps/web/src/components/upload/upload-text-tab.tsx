import { api } from "@scrollect/backend/convex/_generated/api";
import { formatFileSize, getFileSizeLimits } from "@scrollect/backend/convex/lib/fileSizeLimits";
import { useMutation } from "convex/react";
import { Link } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUploadErrorHandler } from "@/components/upload/upload-error-provider";
import { useBilling } from "@/hooks/use-billing";

export function UploadTextTab() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [textTouched, setTextTouched] = useState(false);
  const posthog = usePostHog();
  const handleUploadError = useUploadErrorHandler();
  const { usage } = useBilling();
  const fileSizeLimits = getFileSizeLimits(usage?.tier ?? "free");

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

      const textBytes = new Blob([trimmedText]).size;
      if (textBytes > fileSizeLimits.text) {
        toast.error(
          `Text too large (${formatFileSize(textBytes)}). Maximum is ${formatFileSize(fileSizeLimits.text)}.`,
        );
        return;
      }

      setSubmitting(true);
      try {
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
        posthog.capture("content.uploaded", {
          source_type: "text",
          file_size: new Blob([trimmedText]).size,
        });
        toast.success(
          <span>
            <strong>{trimmedTitle}</strong> added! Processing typically takes 3-5 minutes and
            continues in the background.{" "}
            <Link to="/app/library" className="underline">
              View in library
            </Link>
          </span>,
        );
      } catch (error) {
        posthog.captureException(error);
        handleUploadError(error, "Something went wrong while saving your text. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [title, text, generateUploadUrl, createFromText, posthog, handleUploadError, fileSizeLimits],
  );

  return (
    <Card className="border border-border p-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center border border-border text-muted-foreground">
            <FileText className="size-8" />
          </div>
          <div>
            <p className="text-lg font-semibold">Paste Text</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste any text to add it to your library (max {formatFileSize(fileSizeLimits.text)}
              ).
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
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

        <div className="flex flex-col gap-2">
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
              {formatFileSize(new Blob([text.trim()]).size)} of{" "}
              {formatFileSize(fileSizeLimits.text)}
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
              <Loader2 className="animate-spin" data-icon="inline-start" />
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
