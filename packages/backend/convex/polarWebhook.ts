import { httpAction } from "./_generated/server";
import { WebhookVerificationError, Webhook } from "@polar-sh/sdk/webhooks";

const webhookSecret = process.env.POLAR_WEBHOOK_SECRET!;

export const polarWebhookHandler = httpAction(async (ctx, request) => {
  const payload = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  let event;
  try {
    const wh = new Webhook({ secret: webhookSecret });
    event = wh.verify(payload, headers);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return new Response("Webhook Verification Failed", { status: 400 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }

  // Handle subscription lifecycle events
  if (event.type === "subscription.created" || event.type === "subscription.updated") {
    // Process subscription logic via mutations later
    console.log("Subscription event received", event.data);
  }

  return new Response("OK", { status: 200 });
});
