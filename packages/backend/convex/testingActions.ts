"use node";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireAuth } from "./lib/functions";

const E2E_EMAIL_PATTERN = /^e2e-.*@test\.scrollect\.dev$/;

export const seedE2EData = action({
  args: {},
  handler: async (ctx): Promise<{ alreadySeeded: boolean; postCount: number }> => {
    const user = await requireAuth(ctx);

    if (!user.email || !E2E_EMAIL_PATTERN.test(user.email)) {
      throw new Error(`Seed refused: email "${user.email}" does not match E2E test pattern`);
    }

    // Idempotency check
    const docCount = await ctx.runQuery(internal.testing.countUserDocuments, {
      userId: user._id,
    });
    if (docCount > 0) {
      return { alreadySeeded: true, postCount: 0 };
    }

    // Store a tiny markdown blob
    const blob = new Blob(["# E2E Seed Document\n\nThis is seeded test content."], {
      type: "text/markdown",
    });
    const storageId = await ctx.storage.store(blob);

    // Insert seeded data
    const result = await ctx.runMutation(internal.testing.insertSeededData, {
      userId: user._id,
      storageId,
    });

    return { alreadySeeded: false, postCount: result.postCount };
  },
});
