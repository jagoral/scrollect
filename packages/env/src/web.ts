import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

declare const importMeta: { env?: Record<string, string | undefined> };

function getEnvVar(key: string): string | undefined {
  try {
    // Vite injects import.meta.env at build time
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return (import.meta as unknown as typeof importMeta).env?.[key] ?? process.env[key];
  } catch {
    return process.env[key];
  }
}

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CONVEX_URL: z.url(),
    VITE_CONVEX_SITE_URL: z.url(),
    VITE_SITE_URL: z.url().optional(),
    VITE_CONTACT_EMAIL: z.email().optional(),
    VITE_PUBLIC_POSTHOG_KEY: z.string().optional(),
    VITE_PUBLIC_POSTHOG_HOST: z.url().optional(),
  },
  runtimeEnv: {
    VITE_CONVEX_URL: getEnvVar("VITE_CONVEX_URL"),
    VITE_CONVEX_SITE_URL: getEnvVar("VITE_CONVEX_SITE_URL"),
    VITE_SITE_URL: getEnvVar("VITE_SITE_URL"),
    VITE_CONTACT_EMAIL: getEnvVar("VITE_CONTACT_EMAIL"),
    VITE_PUBLIC_POSTHOG_KEY: getEnvVar("VITE_PUBLIC_POSTHOG_KEY"),
    VITE_PUBLIC_POSTHOG_HOST: getEnvVar("VITE_PUBLIC_POSTHOG_HOST"),
  },
  emptyStringAsUndefined: true,
});
