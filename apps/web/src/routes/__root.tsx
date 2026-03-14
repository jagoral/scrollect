/// <reference types="vite/client" />
import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { ConvexReactClient } from "convex/react";

import appCss from "@/index.css?url";
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
  return (
    <Providers initialToken={initialToken} convexClient={convexClient}>
      <div className="grid grid-rows-[auto_1fr] h-svh">
        <Header />
        <main className="flex flex-col overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </Providers>
  );
}
