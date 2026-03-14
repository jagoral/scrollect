import { createFileRoute } from "@tanstack/react-router";
import { api } from "@scrollect/backend/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { env } from "@scrollect/env/web";
import { getToken } from "@/lib/auth-server";

export const Route = createFileRoute("/api/e2e-seed")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const token = await getToken();
          if (!token) {
            return Response.json({ error: "No auth token" }, { status: 401 });
          }
          const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
          client.setAuth(token);
          const result = await client.action(api.testingActions.seedE2EData);
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Seed failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
