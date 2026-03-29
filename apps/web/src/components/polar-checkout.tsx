import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function PolarCheckoutButton({ className }: { className?: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckout = async () => {
    setIsLoading(true);
    try {
      // Create a checkout session using the generic HTTP action we will add to Convex
      const response = await fetch("/api/polar/checkout", {
        method: "POST",
      });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Failed to initiate Polar checkout", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleCheckout}
      className={className || "w-full bg-emerald-600 hover:bg-emerald-700"}
      disabled={isLoading}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Subscribe with Polar
    </Button>
  );
}
