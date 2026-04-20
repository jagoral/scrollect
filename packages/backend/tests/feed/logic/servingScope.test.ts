import { describe, expect, it } from "vitest";

import { DEFAULT_SCORING_CONFIG } from "../../../src/feed/logic/scoring";
import {
  allFeedScope,
  buildServingConfig,
  determineEmptyReasonForScope,
  documentFeedScope,
  servingScopeDocumentId,
  servingScopeLabel,
  shouldScheduleReplenishmentForScope,
} from "../../../src/feed/logic/servingScope";

describe("serving scope policy", () => {
  it("keeps the all-feed scoring config unchanged", () => {
    const scope = allFeedScope();

    expect(servingScopeLabel(scope)).toBe("all");
    expect(servingScopeDocumentId(scope)).toBeUndefined();
    expect(buildServingConfig(scope)).toBe(DEFAULT_SCORING_CONFIG);
  });

  it("disables the document diversity cap for document-scoped serving", () => {
    const scope = documentFeedScope("doc-1");
    const config = buildServingConfig(scope);

    expect(servingScopeLabel(scope)).toBe("document");
    expect(servingScopeDocumentId(scope)).toBe("doc-1");
    expect(config.documentDiversityCap).toBe(1);
    expect(config.batchSize).toBe(DEFAULT_SCORING_CONFIG.batchSize);
  });

  it("only schedules replenishment for the all feed", () => {
    expect(
      shouldScheduleReplenishmentForScope({
        scope: allFeedScope(),
        remainingPending: DEFAULT_SCORING_CONFIG.replenishmentThreshold - 1,
        config: DEFAULT_SCORING_CONFIG,
      }),
    ).toBe(true);

    expect(
      shouldScheduleReplenishmentForScope({
        scope: documentFeedScope("doc-1"),
        remainingPending: 0,
        config: buildServingConfig(documentFeedScope("doc-1")),
      }),
    ).toBe(false);
  });

  it("reports processing for an empty document-scoped feed while the document is indexing", () => {
    expect(
      determineEmptyReasonForScope({
        scope: documentFeedScope("doc-1"),
        documentStatus: "summarizing",
        hasAnyDocument: true,
        hasProcessingDocument: false,
      }),
    ).toBe("processing");
  });

  it("reports no drafts for ready document-scoped feeds with an empty pool", () => {
    expect(
      determineEmptyReasonForScope({
        scope: documentFeedScope("doc-1"),
        documentStatus: "ready",
        hasAnyDocument: true,
        hasProcessingDocument: false,
      }),
    ).toBe("no_drafts");
  });
});
