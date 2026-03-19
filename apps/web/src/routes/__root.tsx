/// <reference types="vite/client" />
import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { ConvexReactClient } from "convex/react";
import { PostHogProvider } from "posthog-js/react";
import { env } from "@scrollect/env/web";

import appCss from "@/index.css?url";
import Footer from "@/components/footer";
import Header from "@/components/header";
import Providers from "@/components/providers";
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

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { initialToken, convexClient } = Route.useRouteContext();
  const posthogKey = env.VITE_PUBLIC_POSTHOG_KEY;

  const content = (
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

  if (!posthogKey) return content;

  return (
    <PostHogProvider
      apiKey={posthogKey}
      options={{
        api_host: "/ingest",
        ui_host: env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
        capture_exceptions: true,
        person_profiles: "identified_only",
      }}
    >
      {content}
    </PostHogProvider>
  );
}
