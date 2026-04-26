import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth/minimal";

import type { DataModel } from "../_generated/dataModel";

import { components } from "../_generated/api";
import { query } from "../_generated/server";
import authConfig from "../auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    baseURL: {
      allowedHosts: [
        "scrollect.app",
        "www.scrollect.app",
        "*-tomaszgl69gmailcoms-projects.vercel.app",
        "*.convex.site",
        "localhost:3000",
      ],
      protocol: "auto",
      fallback: process.env.SITE_URL ?? "https://scrollect.app",
    },
    // The `expo()` plugin auto-registers `exp://` in development only; the
    // production-only Scrollect URI scheme is added here.
    trustedOrigins: ["scrollect://"],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
      }),
      expo(),
    ],
  });
}

export { createAuth };

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
  },
});
