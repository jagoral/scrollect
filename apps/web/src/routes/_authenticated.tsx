import { Link, Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { DetailPanel, DetailPanelProvider } from "@/components/detail-panel";
import { LibraryDetailPanel, LibraryDetailProvider } from "@/components/library-detail-panel";
import { ModeToggle } from "@/components/mode-toggle";
import { ScrollectBrand } from "@/components/scrollect-logo";
import UserMenu from "@/components/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { usePostHogIdentify } from "@/hooks/use-posthog-identify";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: async ({ context }) => {
    if (!context.initialToken) {
      throw redirect({ to: "/signin" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  usePostHogIdentify();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isFeedRoute = pathname === "/app/feed" || pathname === "/app/saved";
  const isLibraryList = pathname === "/app/library" || pathname === "/app/library/";

  return (
    <SidebarProvider open={true}>
      <header className="fixed top-0 z-50 flex h-14 w-full items-center gap-2 border-b border-border bg-background px-4">
        <SidebarTrigger className="-ml-1 md:hidden" />
        <Separator orientation="vertical" className="mr-2 h-full md:hidden" />
        <Link to="/" className="text-foreground">
          <ScrollectBrand iconSize="sm" />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </header>
      <div className="flex w-full pt-14">
        <AppSidebar />
        <SidebarInset>
          {isFeedRoute ? (
            <DetailPanelProvider>
              <div className="flex flex-1">
                <main className="w-full max-w-2xl shrink-0">
                  <Outlet />
                </main>
                <DetailPanel />
              </div>
            </DetailPanelProvider>
          ) : isLibraryList ? (
            <LibraryDetailProvider>
              <div className="flex flex-1 overflow-hidden">
                <main className="w-full max-w-2xl shrink-0 border-r border-border">
                  <Outlet />
                </main>
                <LibraryDetailPanel />
              </div>
            </LibraryDetailProvider>
          ) : (
            <main className="w-full max-w-3xl shrink-0">
              <Outlet />
            </main>
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
