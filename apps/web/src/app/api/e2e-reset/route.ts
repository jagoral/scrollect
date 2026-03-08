import { api } from "@scrollect/backend/convex/_generated/api";

import { fetchAuthMutation } from "@/lib/auth-server";

export async function POST() {
  try {
    const result = await fetchAuthMutation(api.testing.resetE2EAccount);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
