import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export function useBilling() {
  const { data: usage } = useQuery(convexQuery(api.entitlements.getDocumentUsage, {}));
  const startProCheckout = useAction(api.polar.startProCheckout);
  const getCustomerPortalUrl = useAction(api.polar.getCustomerPortalUrl);

  const [isPending, setIsPending] = useState(false);

  const upgradeToPro = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      const origin = window.location.origin;
      const { url } = await startProCheckout({
        origin,
        successUrl: `${origin}/app/library`,
      });
      window.location.href = url;
    } catch (error) {
      console.error("Failed to start Pro checkout", error);
      toast.error("Could not start checkout. Please try again in a moment.");
      setIsPending(false);
    }
  }, [isPending, startProCheckout]);

  const openCustomerPortal = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      const { url } = await getCustomerPortalUrl();
      window.location.href = url;
    } catch (error) {
      console.error("Failed to open customer portal", error);
      toast.error("Could not open billing portal. Please try again in a moment.");
      setIsPending(false);
    }
  }, [isPending, getCustomerPortalUrl]);

  return {
    usage,
    isPending,
    upgradeToPro,
    openCustomerPortal,
  };
}
