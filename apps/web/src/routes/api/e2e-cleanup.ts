import { createFileRoute } from "@tanstack/react-router";
import { api } from "@scrollect/backend/convex/_generated/api";
import { fetchAuthMutation } from "@/lib/auth-server";

export const Route = createFileRoute("/api/e2e-cleanup")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await fetchAuthMutation(api.testing.cleanupCurrentUser);
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Cleanup failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
