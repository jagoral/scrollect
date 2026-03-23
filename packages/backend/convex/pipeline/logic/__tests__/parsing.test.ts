import { describe, expect, it, vi } from "vitest";

import { interpretPollResult, submitForParsing } from "../parsing";
import { createMockParser, createMockParsingServices } from "./mocks";

describe("submitForParsing", () => {
  it("calls parser.submit and returns checkUrl", async () => {
    const parser = createMockParser({
      submit: vi.fn().mockResolvedValue("https://api.example.com/check/abc"),
    });
    const services = createMockParsingServices({ parser });

    const result = await submitForParsing({
      fileUrl: "https://storage.example.com/file.pdf",
      services,
    });

    expect(parser.submit).toHaveBeenCalledWith("https://storage.example.com/file.pdf");
    expect(result.checkUrl).toBe("https://api.example.com/check/abc");
  });
});

describe("interpretPollResult", () => {
  it("returns complete with markdown when poll status is complete", () => {
    const result = interpretPollResult({
      pollResult: { status: "complete", markdown: "# Parsed doc" },
      elapsedMs: 5000,
      maxDurationMs: 300_000,
    });

    expect(result).toEqual({ status: "complete", markdown: "# Parsed doc" });
  });

  it("returns error with message when poll status is error", () => {
    const result = interpretPollResult({
      pollResult: { status: "error", errorMessage: "Bad format" },
      elapsedMs: 5000,
      maxDurationMs: 300_000,
    });

    expect(result).toEqual({ status: "error", errorMessage: "Bad format" });
  });

  it("returns default error message when errorMessage is missing", () => {
    const result = interpretPollResult({
      pollResult: { status: "error" },
      elapsedMs: 5000,
      maxDurationMs: 300_000,
    });

    expect(result).toEqual({ status: "error", errorMessage: "Document parsing failed" });
  });

  it("returns timeout when elapsed exceeds maxDuration", () => {
    const result = interpretPollResult({
      pollResult: { status: "pending" },
      elapsedMs: 400_000,
      maxDurationMs: 300_000,
    });

    expect(result).toEqual({ status: "timeout" });
  });

  it("timeout takes precedence over complete status", () => {
    const result = interpretPollResult({
      pollResult: { status: "complete", markdown: "# Content" },
      elapsedMs: 400_000,
      maxDurationMs: 300_000,
    });

    expect(result).toEqual({ status: "timeout" });
  });

  it("returns pending when poll is still in progress", () => {
    const result = interpretPollResult({
      pollResult: { status: "pending" },
      elapsedMs: 10_000,
      maxDurationMs: 300_000,
    });

    expect(result).toEqual({ status: "pending" });
  });
});
