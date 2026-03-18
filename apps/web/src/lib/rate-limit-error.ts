import { ConvexError } from "convex/values";
import { toast } from "sonner";

type RateLimitErrorData = { kind: "RateLimited"; name: string; retryAfter: number };

export function isRateLimitError(
  error: unknown,
): error is ConvexError<string> & { data: RateLimitErrorData } {
  return (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    (error.data as Record<string, unknown>).kind === "RateLimited"
  );
}

export function formatRetryAfter(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} second${totalSeconds !== 1 ? "s" : ""}`;
  const minutes = Math.ceil(ms / 60_000);
  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

export function getRateLimitMessage(error: unknown): string | null {
  if (!isRateLimitError(error)) return null;
  const wait = formatRetryAfter(error.data.retryAfter);
  return `You've hit the rate limit. Please try again in ${wait}.`;
}

export function toastRateLimitOrFallback(error: unknown, fallbackMessage: string) {
  const rateLimitMsg = getRateLimitMessage(error);
  toast.error(rateLimitMsg ?? fallbackMessage);
}
