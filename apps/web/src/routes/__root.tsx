/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

import appCss from "@/index.css?url";
import Providers from "@/components/providers";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth-server";

export const Route = createRootRoute({
  beforeLoad: async () => {
    const initialToken = await getSession();
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
  errorComponent: ErrorComponent,
  notFoundComponent: NotFoundComponent,
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
  const { initialToken } = Route.useRouteContext();
  return (
    <Providers initialToken={initialToken}>
      <div className="grid grid-rows-[auto_1fr] h-svh">
        <Header />
        <main className="flex flex-col overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </Providers>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground">{error.message}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button variant="default" render={<a href="/" />}>
          Go home
        </Button>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Button variant="default" render={<a href="/" />}>
        Go home
      </Button>
    </div>
  );
}
