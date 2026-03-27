import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

export const markerWebhookHandler = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const expectedSecret = process.env.MARKER_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  await ctx.runAction(internal.pipeline.markerWebhookProcessor.processWebhook, {
    payload: JSON.stringify(body),
  });

  return new Response("OK", { status: 200 });
});
