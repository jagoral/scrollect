import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { toastRateLimitOrFallback } from "@/lib/rate-limit-error";
import { isDocumentLimitError } from "@/lib/upgrade-error";

type UploadErrorContextValue = {
  handleUploadError: (error: unknown, fallbackMessage: string) => void;
};

const UploadErrorContext = createContext<UploadErrorContextValue | null>(null);

export function UploadErrorProvider({ children }: { children: ReactNode }) {
  const [openTier, setOpenTier] = useState<"free" | "pro" | null>(null);

  const handleUploadError = useCallback((error: unknown, fallbackMessage: string) => {
    if (isDocumentLimitError(error)) {
      setOpenTier(error.data.tier);
      return;
    }
    toastRateLimitOrFallback(error, fallbackMessage);
  }, []);

  const value = useMemo(() => ({ handleUploadError }), [handleUploadError]);

  const isProLimit = openTier === "pro";

  return (
    <UploadErrorContext.Provider value={value}>
      {children}
      <UpgradeDialog
        open={openTier !== null}
        onOpenChange={(open) => {
          if (!open) setOpenTier(null);
        }}
        source="upload_limit"
        title={
          isProLimit
            ? "You've used every document in this cycle"
            : "You've used all 3 free documents"
        }
        description={
          isProLimit
            ? "Your limit resets with your next billing cycle. Your existing feed and library are unaffected."
            : "Upgrade to Pro for 30 documents per month. Your existing feed and library stay as-is."
        }
      />
    </UploadErrorContext.Provider>
  );
}

export function useUploadErrorHandler() {
  const ctx = useContext(UploadErrorContext);
  if (!ctx) {
    throw new Error("useUploadErrorHandler must be used within UploadErrorProvider");
  }
  return ctx.handleUploadError;
}
