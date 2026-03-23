/**
 * Temporary integration test to verify Supadata API works as expected.
 * Run with: SUPADATA_API_KEY=<key> npx vitest run tests/supadata-integration.test.ts
 *
 * This test makes real API calls and consumes credits. Remove after verification.
 */

import { describe, expect, test } from "vitest";

import { Supadata } from "@supadata/js";

describe("Supadata integration", () => {
  const apiKey = process.env.SUPADATA_API_KEY;

  test.skipIf(!apiKey)(
    "fetches timestamped transcript for a known YouTube video",
    async () => {
      const supadata = new Supadata({ apiKey: apiKey! });

      // Short, well-known video with captions (Rick Astley - Never Gonna Give You Up)
      const result = await supadata.transcript({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        text: false,
      });

      // Should NOT be an async job response (video is ~3.5 min, under 20 min threshold)
      expect("jobId" in result).toBe(false);

      // Verify top-level shape
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("lang");
      expect(result).toHaveProperty("availableLangs");
      expect(Array.isArray(result.content)).toBe(true);
      expect(typeof result.lang).toBe("string");
      expect(Array.isArray(result.availableLangs)).toBe(true);

      // Verify we got actual segments
      const content = result.content as Array<Record<string, unknown>>;
      expect(content.length).toBeGreaterThan(0);

      // Verify segment shape
      const segment = content[0]!;
      expect(typeof segment.text).toBe("string");
      expect(typeof segment.offset).toBe("number");
      expect(typeof segment.duration).toBe("number");
      expect(typeof segment.lang).toBe("string");

      // Sanity check values
      expect((segment.text as string).length).toBeGreaterThan(0);
      expect(segment.offset).toBeGreaterThanOrEqual(0);
      expect(segment.duration).toBeGreaterThan(0);
    },
    30_000,
  );
});
