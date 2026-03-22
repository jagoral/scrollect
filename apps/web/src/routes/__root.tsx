/// <reference types="vite/client" />
import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import type { ConvexReactClient } from "convex/react";
import { PostHogProvider, usePostHog } from "posthog-js/react";
import { env } from "@scrollect/env/web";

import geistSans400 from "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2?url";
import geistSans600 from "@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2?url";
import fraunces600 from "@fontsource/fraunces/files/fraunces-latin-600-normal.woff2?url";
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
      {
        property: "og:image",
        content: "https://scrollect.app/og-image.png",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:url", content: "https://scrollect.app" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "Scrollect - AI-Powered Personal Learning Feed",
      },
      {
        name: "twitter:description",
        content:
          "Transform your saved content into a scrollable feed of bite-sized learning cards.",
      },
      {
        name: "twitter:image",
        content: "https://scrollect.app/og-image.png",
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

function AnalyticsInit() {
  const posthog = usePostHog();
  useCookieConsent(posthog);
  return null;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href={geistSans400}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href={geistSans600}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href={fraunces600}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <PostHogProvider
          apiKey={env.VITE_PUBLIC_POSTHOG_KEY ?? ""}
          options={{
            api_host: "/ingest",
            ui_host: env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
            capture_exceptions: true,
            capture_performance: { web_vitals: true },
            person_profiles: "identified_only",
            opt_out_capturing_by_default: true,
            persistence: "memory",
          }}
        >
          <AnalyticsInit />
          {children}
        </PostHogProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { initialToken, convexClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname.startsWith("/dev/")) {
    return <Outlet />;
  }

  return (
    <Providers initialToken={initialToken} convexClient={convexClient}>
      <div className="flex min-h-svh flex-col">
        <Header />
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
        <Footer />
      </div>
    </Providers>
  );
}
