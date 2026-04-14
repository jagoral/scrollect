import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { AlertTriangle, Loader2, RefreshCw, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const STAGE_LABELS: Record<string, string> = {
  parsing: "text parsing",
  chunking: "content chunking",
  embedding: "embedding generation",
  summarizing: "summarization",
  generating_cards: "card generation",
};

interface PipelineErrorProps {
  documentId: Id<"documents">;
  errorMessage?: string;
  failedAt?: string;
}

export function PipelineError({ documentId, errorMessage, failedAt }: PipelineErrorProps) {
  const retryProcessing = useMutation(api.documents.retry);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryProcessing({ id: documentId });
      toast.success("Retrying processing - this may take a few minutes.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to retry processing");
    } finally {
      setRetrying(false);
    }
  };

  const stageLabel = failedAt ? (STAGE_LABELS[failedAt] ?? failedAt) : null;

  return (
    <div className="mt-8" data-testid="pipeline-error">
      <div className="border border-border bg-card p-5" role="alert">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center border border-amber-500/30">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Processing ran into an issue{stageLabel ? ` during ${stageLabel}` : ""}
            </p>
            {errorMessage && (
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {errorMessage}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={retrying}
                data-testid="retry-processing-button"
              >
                {retrying ? (
                  <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
                ) : (
                  <RefreshCw className="size-3.5" data-icon="inline-start" />
                )}
                Retry processing
              </Button>
              <Button
                size="sm"
                variant="ghost"
                render={<Link to="/app/upload" />}
                data-testid="reupload-button"
              >
                <Upload className="size-3.5" data-icon="inline-start" />
                Re-upload
              </Button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground/60">
              If retrying doesn&apos;t help, try re-uploading in a different format (e.g. PDF
              instead of EPUB).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
