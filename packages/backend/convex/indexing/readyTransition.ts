"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { WideEvent } from "../../src/platform/logging";
import { captureEvent } from "../../src/providers/analytics/posthog";

export async function transitionToReady(opts: {
  ctx: ActionCtx;
  documentId: Id<"documents">;
  userId: string | undefined;
  evt: WideEvent;
}) {
  const { ctx, documentId, userId, evt } = opts;
  await ctx.runMutation(internal.content.documents.updateStatus, {
    id: documentId,
    status: "ready",
  });

  await ctx.scheduler.runAfter(0, internal.indexing.tagging.autoSuggest, { documentId });
  await ctx.scheduler.runAfter(0, internal.drafting.connectionDiscovery.discover, { documentId });

  if (userId) {
    await captureEvent({
      distinctId: userId,
      event: "pipeline.stage_completed",
      properties: {
        stage: "generating_cards",
        document_id: documentId,
        duration_ms: evt.getElapsedMs(),
      },
    });
  }

  evt.set("transitionedToReady", true);
}
