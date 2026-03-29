import { httpAction } from "./_generated/server";
import { Polar } from "@polar-sh/sdk";
import { getCurrentUser } from "./auth";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN || "",
  server: "sandbox",
});

export const createCheckoutSession = httpAction(async (ctx, request) => {
  const user = await getCurrentUser(ctx, {});

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Note: productId would typically come from an environment variable
    const productId = process.env.POLAR_PRO_PRODUCT_ID || "pro_tier_id";

    const checkout = await polar.checkouts.custom.create({
      productId,
      customerEmail: user.email,
      customerName: user.name,
      // Metadata allows us to securely link the polar event back to our Convex user
      metadata: {
        userId: user.id,
      },
    });

    return new Response(JSON.stringify({ url: checkout.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Polar checkout error:", error);
    return new Response(JSON.stringify({ error: "Failed to create checkout session" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
