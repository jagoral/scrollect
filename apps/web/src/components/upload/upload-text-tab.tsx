import { api } from "@scrollect/backend/convex/_generated/api";
import { formatFileSize, getFileSizeLimits } from "@scrollect/backend/src/platform/fileSizeLimits";
import { useMutation } from "convex/react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { LearningGoalOnboardingPrompt } from "@/components/upload/learning-goal-onboarding-dialog";
import { useUploadErrorHandler } from "@/components/upload/upload-error-provider";
import { useBilling } from "@/hooks/use-billing";
import { cn } from "@/lib/utils";

type UploadTextTabProps = {
  onDocumentCreated: (prompt: LearningGoalOnboardingPrompt) => void;
};

export function UploadTextTab({ onDocumentCreated }: UploadTextTabProps) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [textTouched, setTextTouched] = useState(false);
  const posthog = usePostHog();
  const handleUploadError = useUploadErrorHandler();
  const { usage } = useBilling();
  const fileSizeLimits = getFileSizeLimits(usage?.tier ?? "free");

  const generateUploadUrl = useMutation(api.content.documents.generateUploadUrl);
  const createFromText = useMutation(api.content.documents.createFromText);

  const trimmedText = text.trim();
  const trimmedTitle = title.trim();
  const bytes = trimmedText ? new Blob([trimmedText]).size : 0;
  const overLimit = bytes > fileSizeLimits.text;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const valueText = text.trim();
      const valueTitle = title.trim();

      if (!valueText) {
        toast.error("Please enter some text content.");
        return;
      }
      if (!valueTitle) {
        toast.error("Please enter a title.");
        return;
      }

      const textBytes = new Blob([valueText]).size;
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
          body: valueText,
        });

        if (!result.ok) {
          throw new Error(`Upload failed: ${result.statusText}`);
        }

        const { storageId } = (await result.json()) as { storageId: string };

        const documentId = await createFromText({
          title: valueTitle,
          storageId: storageId as never,
        });
        onDocumentCreated({ documentId, documentTitle: valueTitle, sourceType: "text" });

        setTitle("");
        setText("");
        setTitleTouched(false);
        setTextTouched(false);
        posthog.capture("content.uploaded", {
          source_type: "text",
          file_size: new Blob([valueText]).size,
        });
        toast.success(
          <span>
            <strong>{valueTitle}</strong> added! Processing typically takes 3-5 minutes and
            continues in the background. Add a learning goal now so posts use it.{" "}
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
    [
      title,
      text,
      generateUploadUrl,
      createFromText,
      posthog,
      handleUploadError,
      fileSizeLimits,
      onDocumentCreated,
    ],
  );

  return (
    <div className="border border-border bg-card">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6 md:p-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-block size-1.5 rounded-full bg-primary/70" />
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.32em] text-muted-foreground">
            Write or paste
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div>
          <h2 className="font-logo text-2xl font-semibold tracking-tight md:text-[1.75rem]">
            Your own notes
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Paste meeting notes, a summary, or any text worth keeping. Max{" "}
            {formatFileSize(fileSizeLimits.text)}.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="text-title"
            className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground"
          >
            Title
          </label>
          <Input
            id="text-title"
            data-testid="text-title-input"
            placeholder="e.g., Q3 strategy notes"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTitleTouched(true)}
            disabled={submitting}
            className="h-11"
          />
          {titleTouched && !title.trim() && (
            <p className="text-sm text-destructive">Title is required</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="text-content"
            className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground"
          >
            Content
          </label>
          <Textarea
            id="text-content"
            data-testid="text-content-input"
            placeholder="Paste your text, notes, or any content here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => setTextTouched(true)}
            disabled={submitting}
            rows={10}
            className="resize-y"
          />
          <div className="flex items-center justify-between">
            {textTouched && !text.trim() ? (
              <p className="text-sm text-destructive">Text content is required</p>
            ) : (
              <span className="text-xs text-muted-foreground">
                {trimmedText ? `${trimmedText.length.toLocaleString()} characters` : ""}
              </span>
            )}
            <span
              className={cn(
                "font-mono text-[10px] tabular-nums uppercase tracking-[0.2em]",
                overLimit ? "text-destructive" : "text-muted-foreground/70",
              )}
            >
              {formatFileSize(bytes)} / {formatFileSize(fileSizeLimits.text)}
            </span>
          </div>
        </div>

        <Button
          data-testid="text-submit"
          type="submit"
          disabled={submitting || !trimmedText || !trimmedTitle || overLimit}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Processing...
            </>
          ) : (
            "Add to library"
          )}
        </Button>
      </form>
    </div>
  );
}
