import { api } from "@scrollect/backend/convex/_generated/api";

import { fetchAuthAction } from "@/lib/auth-server";

export async function POST() {
  try {
    const result = await fetchAuthAction(api.testingActions.seedE2EData);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seed failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
