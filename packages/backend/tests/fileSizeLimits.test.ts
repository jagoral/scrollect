import { describe, expect, test } from "bun:test";

import {
  FILE_SIZE_LIMITS,
  formatFileSize,
  getFileSizeLimit,
} from "../convex/lib/fileSizeLimits";

describe("FILE_SIZE_LIMITS", () => {
  test("matches expected limits", () => {
    expect(FILE_SIZE_LIMITS).toEqual({
      pdf: 52428800,
      epub: 10485760,
      md: 5242880,
      text: 5242880,
    });
  });
});

describe("formatFileSize", () => {
  test("0 bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  test("1 byte", () => {
    expect(formatFileSize(1)).toBe("1 B");
  });

  test("1023 bytes", () => {
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  test("1024 bytes", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  test("1536 bytes", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  test("1048575 bytes (just under 1 MB)", () => {
    expect(formatFileSize(1048575)).toBe("1024.0 KB");
  });

  test("1048576 bytes (exactly 1 MB)", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
  });

  test("52428800 bytes (50 MB)", () => {
    expect(formatFileSize(52428800)).toBe("50.0 MB");
  });
});

describe("getFileSizeLimit", () => {
  test("pdf returns 50 MB", () => {
    expect(getFileSizeLimit("pdf")).toBe(52428800);
  });

  test("epub returns 10 MB", () => {
    expect(getFileSizeLimit("epub")).toBe(10485760);
  });

  test("md returns 5 MB", () => {
    expect(getFileSizeLimit("md")).toBe(5242880);
  });

  test("text returns 5 MB", () => {
    expect(getFileSizeLimit("text")).toBe(5242880);
  });

  test("docx returns undefined", () => {
    expect(getFileSizeLimit("docx")).toBeUndefined();
  });

  test("empty string returns undefined", () => {
    expect(getFileSizeLimit("")).toBeUndefined();
  });
});
