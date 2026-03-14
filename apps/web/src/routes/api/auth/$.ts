import { createFileRoute } from "@tanstack/react-router";
import { setCookie } from "@tanstack/react-start/server";
import { handler } from "@/lib/auth-server";

function parseSetCookieAttribute(raw: string) {
  const parts = raw.split(";").map((s) => s.trim());
  const [nameValue, ...attrs] = parts;
  const eqIdx = nameValue.indexOf("=");
  const name = nameValue.substring(0, eqIdx);
  const value = nameValue.substring(eqIdx + 1);

  const options: Record<string, unknown> = {};
  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower === "httponly") options.httpOnly = true;
    else if (lower === "secure") options.secure = true;
    else if (lower.startsWith("path=")) options.path = attr.split("=")[1];
    else if (lower.startsWith("max-age=")) options.maxAge = Number(attr.split("=")[1]);
    else if (lower.startsWith("samesite=")) options.sameSite = attr.split("=")[1] as "lax";
    else if (lower.startsWith("domain=")) options.domain = attr.split("=")[1];
  }
  return { name, value, options };
}

async function handleAuth(request: Request): Promise<Response> {
  const response = await handler(request);

  // The proxy fetches from Convex via server-side fetch. Multiple Set-Cookie
  // headers get combined by the Fetch API into a single comma-separated value
  // which browsers can't parse. Extract individual cookies and set them via
  // h3's setCookie which writes proper separate Set-Cookie headers.
  const rawSetCookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];

  for (const raw of rawSetCookies) {
    const { name, value, options } = parseSetCookieAttribute(raw);
    setCookie(name, value, options);
  }

  // Strip Set-Cookie from the Response to avoid duplicates with h3's cookies
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
