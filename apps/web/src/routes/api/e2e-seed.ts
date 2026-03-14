import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@scrollect/backend/convex/_generated/api";
import { env } from "@scrollect/env/web";

function extractCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export const Route = createFileRoute("/api/e2e-seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = extractCookie(request, "better-auth.convex_jwt");
          if (!token) {
            const cookieHeader = request.headers.get("cookie");
            return Response.json(
              {
                error: `Not authenticated. Cookie header: ${cookieHeader ? "present" : "missing"}`,
              },
              { status: 401 },
            );
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
