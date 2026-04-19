import { describe, expect, it } from "vitest";

import { StubPostDraftValidator } from "../../src/providers/stubs";
import type { DraftPostType } from "../../src/providers/types";

const SHORT_CONTENT = "A short fixture passage.";
const LONG_CONTENT = "A ".repeat(250);

/**
 * ADR-018 §1 distribution guarantees: across a realistic 4-type draft generation run
 * the stub `semanticQualityScore` must deliver std >= 0.15 and >= 20% of drafts below
 * 0.7. A realistic mix respects the #215 generation-side quote cap (~20% of drafts)
 * so the distribution does not over-weight the low-quote band. These tests lock the
 * stub distribution so the eval harness and generation-time dashboards catch drift
 * early.
 */
describe("StubPostDraftValidator distribution", () => {
  it("satisfies the ADR-018 std and below-0.7 share targets on a realistic mix", async () => {
    const validator = new StubPostDraftValidator();
    const mix: Array<{ postType: DraftPostType; count: number; content: string }> = [
      { postType: "quote", count: 20, content: SHORT_CONTENT },
      { postType: "summary", count: 25, content: LONG_CONTENT },
      { postType: "quiz", count: 25, content: LONG_CONTENT },
      { postType: "insight", count: 30, content: LONG_CONTENT },
    ];

    const scores: number[] = [];
    for (const entry of mix) {
      for (let i = 0; i < entry.count; i++) {
        const result = await validator.validateDraft({
          postType: entry.postType,
          content: entry.content,
          typeData: {},
          sectionTitle: "Test Section",
          documentTitle: "Test Document",
        });
        scores.push(result.semanticQualityScore!);
      }
    }

    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
    const std = Math.sqrt(variance);
    const belowThreshold = scores.filter((s) => s < 0.7).length / scores.length;

    expect(std, `std=${std.toFixed(3)}`).toBeGreaterThanOrEqual(0.15);
    expect(belowThreshold, `fractionBelow07=${belowThreshold.toFixed(3)}`).toBeGreaterThanOrEqual(
      0.2,
    );
  });

  it("keeps verbatim-but-uneducational quote cards below 0.7 (ADR-018 quote anchor)", async () => {
    const validator = new StubPostDraftValidator();
    const result = await validator.validateDraft({
      postType: "quote",
      content: LONG_CONTENT,
      typeData: {},
      sectionTitle: "Any Section",
      documentTitle: "Any Document",
    });
    expect(result.semanticQualityScore!).toBeLessThan(0.7);
  });
});
