import { httpActionGeneric, httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

const E2E_EMAIL_PATTERN = /^e2e-.*@test\.scrollect\.dev$/;

function validateE2ESecret(request: Request): boolean {
  const secret = request.headers.get("x-e2e-secret");
  return !!secret && secret === process.env.E2E_TEST_SECRET;
}

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

http.route({
  path: "/api/e2e-seed",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      if (!validateE2ESecret(request)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const email = await parseEmail(request);
      const result = await ctx.runAction(internal.testingActions.seedE2EDataByEmail, { email });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Seed failed";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/api/e2e-cleanup",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      if (!validateE2ESecret(request)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const email = await parseEmail(request);
      const userId = await resolveUserId(ctx, email);
      const result = await ctx.runMutation(internal.testing.cleanupByUserId, { userId });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cleanup failed";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/api/e2e-reset",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      if (!validateE2ESecret(request)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const email = await parseEmail(request);
      const userId = await resolveUserId(ctx, email);
      const result = await ctx.runMutation(internal.testing.resetByUserId, { userId });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reset failed";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
