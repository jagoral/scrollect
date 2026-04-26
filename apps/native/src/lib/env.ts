import { z } from "zod";

const schema = z.object({
  EXPO_PUBLIC_CONVEX_URL: z.url(),
  EXPO_PUBLIC_CONVEX_SITE_URL: z.url(),
  EXPO_PUBLIC_SITE_URL: z.url().default("https://scrollect.app"),
  EXPO_PUBLIC_POSTHOG_KEY: z.string().optional(),
  EXPO_PUBLIC_POSTHOG_HOST: z.url().default("https://eu.posthog.com"),
});

const parsed = schema.safeParse({
  EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL,
  EXPO_PUBLIC_CONVEX_SITE_URL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
  EXPO_PUBLIC_SITE_URL: process.env.EXPO_PUBLIC_SITE_URL,
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment configuration. Copy apps/native/.env.example to apps/native/.env and fill in the required values:\n${issues}`,
  );
}

export const env = parsed.data;
