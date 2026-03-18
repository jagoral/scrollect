import { ConvexError } from "convex/values";

export function isRateLimitError(
  error: unknown,
): error is { data: { kind: "RateLimited"; name: string; retryAfter: number } } {
  return (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    (error.data as Record<string, unknown>).kind === "RateLimited"
  );
}

export function formatRetryAfter(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? "s" : ""}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

export function getRateLimitMessage(error: unknown): string | null {
  if (!isRateLimitError(error)) return null;
  const wait = formatRetryAfter(error.data.retryAfter);
  return `You've hit the rate limit. Please try again in ${wait}.`;
}
