import { createHash } from "crypto";

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Convert a Convex document ID to a deterministic UUID for Qdrant. */
export function convexIdToUuid(id: string): string {
  const hex = createHash("sha256").update(id).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
