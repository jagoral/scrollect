import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "@scrollect/env/web";

export const { handler, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction } =
  convexBetterAuthReactStart({
    convexUrl: env.VITE_CONVEX_URL,
    convexSiteUrl: env.VITE_CONVEX_SITE_URL,
  });

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  // Read cookies directly from the request to bypass any caching in the
  // convexBetterAuthReactStart getToken() chain.
  const headers = getRequestHeaders();
  const cookie = headers.get("cookie") ?? "";
  if (!cookie) return null;

  const fwdHeaders = new Headers();
  fwdHeaders.set("cookie", cookie);

  try {
    const res = await fetch(`${env.VITE_CONVEX_SITE_URL}/api/auth/convex/token`, {
      headers: fwdHeaders,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data as { token?: string }).token ?? null;
  } catch {
    return null;
  }
});
