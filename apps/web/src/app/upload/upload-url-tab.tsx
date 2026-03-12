"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { Globe, Loader2, Youtube } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function detectUrlType(url: string): "youtube" | "article" {
  try {
    const hostname = new URL(url).hostname.replace("www.", "").toLowerCase();
    if (hostname === "youtube.com" || hostname === "youtu.be" || hostname === "m.youtube.com") {
      return "youtube";
    }
  } catch {
    // Invalid URL — default to article
  }
  return "article";
}

function isValidUrl(input: string): boolean {
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
        toast.success(
          <span>
            Submitted for processing.{" "}
            <Link href="/library" className="underline">
              View in library
            </Link>
          </span>,
        );
        setUrl("");
      } catch {
        toast.error("Something went wrong while processing this URL. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [url, createFromUrl],
  );

  return (
    <Card className="rounded-xl border-2 border-muted-foreground/20 p-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Globe className="h-8 w-8" />
          </div>
          <div>
            <p className="text-lg font-semibold">Paste a URL</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add an article or YouTube video to your library.
            </p>
          </div>
        </div>

        <div className="space-y-2">
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
                      <Youtube className="h-3 w-3" />
                      YouTube
                    </>
                  ) : (
                    <>
                      <Globe className="h-3 w-3" />
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
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
