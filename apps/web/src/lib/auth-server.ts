import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";
import { ConvexHttpClient } from "convex/browser";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { env } from "@scrollect/env/web";

export const { handler, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction } =
  convexBetterAuthReactStart({
    convexUrl: env.VITE_CONVEX_URL,
    convexSiteUrl: env.VITE_CONVEX_SITE_URL,
    jwtCache: {
      enabled: true,
      isAuthError: (error: unknown) =>
        error instanceof Error && error.message.includes("Not authenticated"),
    },
  });

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const token = await getToken();
  return token ?? null;
});

function getJwtFromCookie(): string | null {
  const jwt = getCookie("better-auth.convex_jwt");
  return jwt ?? null;
}

export async function fetchAuthActionDirect<T>(
  action: Parameters<typeof fetchAuthAction>[0],
): Promise<T> {
  const token = getJwtFromCookie();
  if (!token) throw new Error("Not authenticated");
  const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
  client.setAuth(token);
  return client.action(action) as Promise<T>;
}

export async function fetchAuthMutationDirect<T>(
  mutation: Parameters<typeof fetchAuthMutation>[0],
): Promise<T> {
  const token = getJwtFromCookie();
  if (!token) throw new Error("Not authenticated");
  const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
  client.setAuth(token);
  return client.mutation(mutation) as Promise<T>;
}
