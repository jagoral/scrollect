import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, User } from "lucide-react";

import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/settings")({
  ssr: false,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(api.auth.getCurrentUser, {}));
  },
  head: () => ({
    meta: [{ title: "Settings | Scrollect" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: user } = useSuspenseQuery(convexQuery(api.auth.getCurrentUser, {}));

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Account</h2>
        <Card className="mt-4">
          <CardContent>
            <div className="flex items-center gap-3">
              <User className="size-4 text-muted-foreground" />
              <span className="text-sm">{user?.name}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Mail className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{user?.email}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
        <Card className="mt-4 border-destructive/30">
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Delete account</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Permanently delete your account and all data. This cannot be undone.
                </p>
              </div>
              <DeleteAccountDialog />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
