import { createFileRoute } from "@tanstack/react-router";
import { setResponseHeader } from "@tanstack/react-start/server";
import { handler } from "@/lib/auth-server";

async function handleAuth(request: Request): Promise<Response> {
  const response = await handler(request);

  // Debug: log what the Convex proxy response actually contains
  const rawSetCookie = response.headers.get("set-cookie");
  const setCookieArray =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  console.log(`[AUTH DEBUG] status=${response.status} url=${request.url}`);
  console.log(`[AUTH DEBUG] raw set-cookie header: ${rawSetCookie}`);
  console.log(`[AUTH DEBUG] getSetCookie() count: ${setCookieArray.length}`);
  for (const c of setCookieArray) {
    console.log(`[AUTH DEBUG] cookie: ${c.substring(0, 100)}`);
  }

  // Extract Set-Cookie headers from the proxied Convex response and re-set
  // them via h3's response API. The raw Response from server-side fetch may
  // have Set-Cookie headers that don't survive the h3 response pipeline
  // (e.g. combined into a single comma-separated value the browser can't parse).
  if (setCookieArray.length > 0) {
    setResponseHeader("Set-Cookie", setCookieArray);
  } else if (rawSetCookie) {
    setResponseHeader("Set-Cookie", rawSetCookie);
  }

  // Return a new Response without Set-Cookie to avoid duplicates — h3 will
  // merge the event-level Set-Cookie headers we just set.
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => handleAuth(request),
      POST: async ({ request }) => handleAuth(request),
    },
  },
});
