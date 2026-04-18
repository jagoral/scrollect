import { api } from "@scrollect/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { Link } from "@tanstack/react-router";
import { Globe, Loader2, Youtube } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUploadErrorHandler } from "@/components/upload/upload-error-provider";

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

export function UploadUrlTab() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const posthog = usePostHog();
  const handleUploadError = useUploadErrorHandler();

  const createFromUrl = useMutation(api.documents.createFromUrl);

  const detectedType = url.trim() ? detectUrlType(url.trim()) : null;
  const urlValid = url.trim() ? isValidUrl(url.trim()) : null;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed || !isValidUrl(trimmed)) {
        toast.error("Please enter a valid URL starting with http:// or https://");
        return;
      }

      setSubmitting(true);
      try {
        const fileType = detectUrlType(trimmed);
        await createFromUrl({ url: trimmed, fileType });
        posthog.capture("content.uploaded", {
          source_type: fileType,
        });
        toast.success(
          <span>
            Submitted! Processing typically takes 3-5 minutes and continues in the background.{" "}
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
    [url, createFromUrl, posthog, handleUploadError],
  );

  return (
    <Card className="border border-border p-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center border border-border text-muted-foreground">
            <Globe className="size-8" />
          </div>
          <div>
            <p className="text-lg font-semibold">Paste a URL</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add an article or YouTube video to your library.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative">
            <Input
              data-testid="url-input"
              type="url"
              placeholder="https://example.com/article or YouTube URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={submitting}
              className="pr-24"
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
          {url.trim() && urlValid === false && (
            <p className="text-sm text-destructive">
              Please enter a valid URL starting with https://
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Supported: articles, blog posts, YouTube videos
          </p>
        </div>

        <Button
          data-testid="url-submit"
          type="submit"
          disabled={submitting || !url.trim() || !urlValid}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Processing...
            </>
          ) : (
            "Add"
          )}
        </Button>
      </form>
    </Card>
  );
}
