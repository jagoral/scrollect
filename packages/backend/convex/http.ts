import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { E2E_EMAIL_PATTERN, isE2EEnabled } from "./lib/e2e";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

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

function e2eNotFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}

http.route({
  path: "/api/e2e-seed",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isE2EEnabled()) return e2eNotFound();
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
  handler: httpAction(async (ctx, request) => {
    if (!isE2EEnabled()) return e2eNotFound();
    try {
      const email = await parseEmail(request);
      const user = await ctx.runQuery(internal.testing.findUserByEmail, { email });
      if (!user) {
        throw new Error(`User not found for email: ${email}`);
      }
      const result = await ctx.runMutation(internal.testing.cleanupByUserId, {
        userId: user._id as string,
      });
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
  handler: httpAction(async (ctx, request) => {
    if (!isE2EEnabled()) return e2eNotFound();
    try {
      const email = await parseEmail(request);
      const user = await ctx.runQuery(internal.testing.findUserByEmail, { email });
      if (!user) {
        throw new Error(`User not found for email: ${email}`);
      }
      const result = await ctx.runMutation(internal.testing.resetByUserId, {
        userId: user._id as string,
      });
      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reset failed";
      return Response.json({ error: message }, { status: 500 });
    }
  }),
});

export default http;
