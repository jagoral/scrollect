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
  const detailGridClassName =
    "grid min-h-[calc(100svh-3.5rem)] min-w-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,60%)_minmax(0,40%)]";
  const detailMainClassName = "min-w-0";

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
      <div className="flex min-h-svh w-full min-w-0 pt-14">
        <AppSidebar />
        <SidebarInset className="min-h-[calc(100svh-3.5rem)] min-w-0 overflow-x-hidden">
          {isFeedRoute ? (
            <DetailPanelProvider>
              <div className={detailGridClassName}>
                <main className={detailMainClassName} data-testid="app-main-scroll">
                  <Outlet />
                </main>
                <DetailPanel />
              </div>
            </DetailPanelProvider>
          ) : isLibraryList ? (
            <LibraryDetailProvider>
              <div className={detailGridClassName}>
                <main className={detailMainClassName} data-testid="app-main-scroll">
                  <Outlet />
                </main>
                <LibraryDetailPanel />
              </div>
            </LibraryDetailProvider>
          ) : (
            <main className="w-full min-w-0">
              <Outlet />
            </main>
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
