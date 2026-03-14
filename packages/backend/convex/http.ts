import { httpActionGeneric, httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

const E2E_EMAIL_PATTERN = /^e2e-.*@test\.scrollect\.dev$/;

async function parseEmail(request: Request): Promise<string> {
  const body = (await request.json()) as { email?: string };
  if (!body.email || typeof body.email !== "string") {
    throw new Error("Missing or invalid email in request body");
  }
  if (!E2E_EMAIL_PATTERN.test(body.email)) {
    throw new Error(`Email "${body.email}" does not match E2E test pattern`);
  }
  return body.email;
}

async function resolveUserId(
  ctx: { runQuery: (ref: any, args: any) => Promise<any> },
  email: string,
): Promise<string> {
  const user = await ctx.runQuery(internal.testing.findUserByEmail, { email });
  if (!user) {
    throw new Error(`User not found for email: ${email}`);
  }
  return user._id as string;
}

if (process.env.NODE_ENV !== "production") {
  http.route({
    path: "/api/e2e-seed",
    method: "POST",
    handler: httpActionGeneric(async (ctx, request) => {
      try {
        const email = await parseEmail(request);
        const result = await ctx.runAction(internal.testingActions.seedE2EDataByEmail, { email });
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Seed failed";
        return Response.json({ error: message }, { status: 500 });
      }
    }),
  });

  http.route({
    path: "/api/e2e-cleanup",
    method: "POST",
    handler: httpActionGeneric(async (ctx, request) => {
      try {
        const email = await parseEmail(request);
        const userId = await resolveUserId(ctx, email);
        const result = await ctx.runMutation(internal.testing.cleanupByUserId, { userId });
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Cleanup failed";
        return Response.json({ error: message }, { status: 500 });
      }
    }),
  });

  http.route({
    path: "/api/e2e-reset",
    method: "POST",
    handler: httpActionGeneric(async (ctx, request) => {
      try {
        const email = await parseEmail(request);
        const userId = await resolveUserId(ctx, email);
        const result = await ctx.runMutation(internal.testing.resetByUserId, { userId });
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Reset failed";
        return Response.json({ error: message }, { status: 500 });
      }
    }),
  });
}

export default http;
