/// <reference types="vite/client" />
import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { ConvexReactClient } from "convex/react";
import { PostHogProvider, usePostHog } from "posthog-js/react";
import { env } from "@scrollect/env/web";

import appCss from "@/index.css?url";
import Footer from "@/components/footer";
import Header from "@/components/header";
import Providers from "@/components/providers";
import { useCookieConsent } from "@/hooks/use-cookie-consent";
import { getSession } from "@/lib/auth-server";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
  convexQueryClient: ConvexQueryClient;
}>()({
  beforeLoad: async ({ context }) => {
    const initialToken = await getSession();
    if (initialToken) {
      context.convexQueryClient.serverHttpClient?.setAuth(initialToken);
    }
    return { initialToken };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Scrollect - AI-Powered Personal Learning Feed" },
      {
        name: "description",
        content:
          "Transform your saved content into a scrollable feed of bite-sized learning cards.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/icon.svg" },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function CookieConsentInit() {
  const posthog = usePostHog();
  useCookieConsent(posthog);
  return null;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <PostHogProvider
          apiKey={env.VITE_PUBLIC_POSTHOG_KEY ?? ""}
          options={{
            api_host: "/ingest",
            ui_host: env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
            capture_exceptions: true,
            person_profiles: "identified_only",
            opt_out_capturing_by_default: true,
            persistence: "memory",
          }}
        >
          <CookieConsentInit />
          {children}
        </PostHogProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { initialToken, convexClient } = Route.useRouteContext();

  return (
    <Providers initialToken={initialToken} convexClient={convexClient}>
      <div className="grid grid-rows-[auto_1fr] h-svh">
        <Header />
        <main className="flex flex-col overflow-y-auto">
          <Outlet />
          <Footer />
        </main>
      </div>
    </Providers>
  );
}
