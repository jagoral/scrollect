import { createScorer } from "evalite";

// Stricter than the production quality scorer (computeLengthScore), which gives
// full marks from 100+. These targets represent the ideal range we want the LLM
// to hit - posts below 350 chars are "too short to be useful on their own".
const MIN_TARGET = 350;
const MAX_TARGET = 1200;

export const contentLength = createScorer<any, any, any>({
  name: "Content Length",
  description: "Checks post content meets the target length range (350-1200 chars)",
  scorer: ({ output }) => {
    if (!output.content) return { score: 0, metadata: { length: 0, reason: "No content" } };

    const len = output.content.length;
    if (len >= MIN_TARGET && len <= MAX_TARGET) {
      return { score: 1, metadata: { length: len, reason: "Within target range" } };
    }
    if (len < MIN_TARGET) {
      const score = Math.max(0, len / MIN_TARGET);
      return { score, metadata: { length: len, reason: `Below minimum target of ${MIN_TARGET}` } };
    }
    const score = Math.max(0.5, 1 - (len - MAX_TARGET) / MAX_TARGET);
    return { score, metadata: { length: len, reason: `Above maximum target of ${MAX_TARGET}` } };
  },
});
