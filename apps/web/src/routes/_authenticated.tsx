import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { usePostHogIdentify } from "@/hooks/use-posthog-identify";

export const Route = createFileRoute("/_authenticated")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: async ({ context }) => {
    if (!context.initialToken) {
      throw redirect({ to: "/signin" });
    }
  },
  pendingMs: 200,
  pendingComponent: () => (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  usePostHogIdentify();
  return <Outlet />;
}
