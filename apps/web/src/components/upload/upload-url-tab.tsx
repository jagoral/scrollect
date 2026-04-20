import { api } from "@scrollect/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { Link } from "@tanstack/react-router";
import { Globe, Loader2, Youtube } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LearningGoalOnboardingPrompt } from "@/components/upload/learning-goal-onboarding-dialog";
import { useUploadErrorHandler } from "@/components/upload/upload-error-provider";

type UploadUrlTabProps = {
  onDocumentCreated: (prompt: LearningGoalOnboardingPrompt) => void;
};

export function detectUrlType(url: string): "youtube" | "article" {
  try {
    const hostname = new URL(url).hostname.replace("www.", "").toLowerCase();
    if (hostname === "youtube.com" || hostname === "youtu.be" || hostname === "m.youtube.com") {
      return "youtube";
    }
  } catch {
    // Invalid URL -- default to article
  }
  return "article";
}

export function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function UploadUrlTab({ onDocumentCreated }: UploadUrlTabProps) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const posthog = usePostHog();
  const handleUploadError = useUploadErrorHandler();

  const createFromUrl = useMutation(api.content.documents.createFromUrl);

  const trimmed = url.trim();
  const detectedType = trimmed ? detectUrlType(trimmed) : null;
  const urlValid = trimmed ? isValidUrl(trimmed) : null;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const value = url.trim();
      if (!value || !isValidUrl(value)) {
        toast.error("Please enter a valid URL starting with http:// or https://");
        return;
      }

      setSubmitting(true);
      try {
        const fileType = detectUrlType(value);
        const documentId = await createFromUrl({ url: value, fileType });
        onDocumentCreated({ documentId, documentTitle: value, sourceType: fileType });
        posthog.capture("content.uploaded", {
          source_type: fileType,
        });
        toast.success(
          <span>
            Submitted! Processing continues in the background. Add a learning goal now so posts use
            it.{" "}
            <Link to="/app/library" className="underline">
              View in library
            </Link>
          </span>,
        );
        setUrl("");
      } catch (error) {
        posthog.captureException(error);
        handleUploadError(
          error,
          "Something went wrong while processing this URL. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [url, createFromUrl, posthog, handleUploadError, onDocumentCreated],
  );

  return (
    <div className="border border-border bg-card">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6 md:p-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-block size-1.5 rounded-full bg-primary/70" />
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.32em] text-muted-foreground">
            From the web
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div>
          <h2 className="font-logo text-2xl font-semibold tracking-tight md:text-[1.75rem]">
            Paste a link
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Articles, blog posts, and YouTube videos are supported.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="url-input"
            className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground"
          >
            URL
          </label>
          <div className="relative">
            <Input
              id="url-input"
              data-testid="url-input"
              type="url"
              placeholder="https://example.com/article or YouTube URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={submitting}
              className="h-11 pr-28"
            />
            {detectedType && urlValid && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Badge data-testid="url-type-badge" variant="secondary" className="gap-1 text-xs">
                  {detectedType === "youtube" ? (
                    <>
                      <Youtube className="size-3" />
                      YouTube
                    </>
                  ) : (
                    <>
                      <Globe className="size-3" />
                      Article
                    </>
                  )}
                </Badge>
              </div>
            )}
          </div>
          {trimmed && urlValid === false && (
            <p className="text-sm text-destructive">
              Please enter a valid URL starting with https://
            </p>
          )}
        </div>

        <Button
          data-testid="url-submit"
          type="submit"
          disabled={submitting || !trimmed || !urlValid}
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
