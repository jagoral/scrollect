import { query } from "./_generated/server";
import { optionalAuth } from "./lib/functions";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) {
      return { message: "Not authenticated" };
    }
    return { message: "This is private" };
  },
});
