import { ConvexError } from "convex/values";

export type DocumentLimitErrorData = {
  kind: "DocumentLimitReached";
  tier: "free" | "pro";
  used: number;
  limit: number;
  resetsAt: number | null;
};

export function isDocumentLimitError(
  error: unknown,
): error is ConvexError<string> & { data: DocumentLimitErrorData } {
  return (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    (error.data as Record<string, unknown>).kind === "DocumentLimitReached"
  );
}
