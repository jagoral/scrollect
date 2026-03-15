import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ConvexReactClient } from "convex/react";

import { authClient } from "@/lib/auth-client";

import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";

export default function Providers({
  children,
  initialToken,
  convexClient,
}: {
  children: React.ReactNode;
  initialToken?: string | null;
  convexClient: ConvexReactClient;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ConvexBetterAuthProvider
        client={convexClient}
        authClient={authClient}
        initialToken={initialToken}
      >
        {children}
        <ReactQueryDevtools buttonPosition="bottom-left" />
      </ConvexBetterAuthProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
