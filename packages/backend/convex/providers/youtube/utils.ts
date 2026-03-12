/**
 * Pure JS utilities for YouTube extraction (video ID parsing, fetch with timeout).
 *
 * Ported from @steipete/summarize-core by Peter Steinberger.
 * Original: https://github.com/steipete/summarize/tree/main/packages/core/src/content/transcript/providers/youtube/
 * License: MIT — https://github.com/steipete/summarize/blob/main/LICENSE
 */

const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    let candidate: string | null = null;

    if (hostname === "youtu.be") {
      candidate = url.pathname.split("/")[1] ?? null;
    }
    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      if (url.pathname.startsWith("/watch")) {
        candidate = url.searchParams.get("v");
      } else if (url.pathname.startsWith("/shorts/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/embed/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/v/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/live/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      }
    }

    const trimmed = candidate?.trim() ?? "";
    return YOUTUBE_VIDEO_ID_PATTERN.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return (
      hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be"
    );
  } catch {
    const lower = rawUrl.toLowerCase();
    return lower.includes("youtube.com") || lower.includes("youtu.be");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&nbsp;", " ");
}

export function sanitizeYoutubeJsonResponse(input: string): string {
  const trimmed = input.trimStart();
  if (trimmed.startsWith(")]}'")) {
    return trimmed.slice(4);
  }
  return trimmed;
}

export function parseTimestampToMs(value: unknown, assumeSeconds = false): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return assumeSeconds ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.includes(":")) {
      const parsed = parseTimestampStringToMs(trimmed);
      if (parsed != null) return parsed;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return assumeSeconds ? Math.round(numeric * 1000) : Math.round(numeric);
    }
  }
  return null;
}

function parseTimestampStringToMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
  }

  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const secondsPart = parts.pop();
  if (secondsPart == null) return null;
  const seconds = Number(secondsPart.replace(",", "."));
  if (!Number.isFinite(seconds) || seconds < 0) return null;

  const minutesPart = parts.pop();
  if (minutesPart == null) return null;
  const minutes = Number(minutesPart);
  if (!Number.isFinite(minutes) || minutes < 0) return null;

  const hoursPart = parts.pop();
  const hours = hoursPart != null ? Number(hoursPart) : 0;
  if (!Number.isFinite(hours) || hours < 0) return null;

  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

export function formatTimestampMs(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function normalizeTranscriptText(input: string): string {
  return input
    .replaceAll("\u00A0", " ")
    .replaceAll(/[\t ]+/g, " ")
    .replaceAll(/\s*\n\s*/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

export interface TranscriptSegment {
  startMs: number;
  endMs?: number | null;
  text: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function fetchWithTimeout(
  input: string | URL | Request,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  if (init?.signal) {
    return fetch(input, init ?? {});
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error(`Fetch timed out after ${timeoutMs}ms`);
      timeoutError.name = "FetchTimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract ytcfg bootstrap config from YouTube page HTML.
 * Uses regex-based parsing — no cheerio dependency.
 */
export function extractYoutubeBootstrapConfig(html: string): Record<string, unknown> | null {
  return parseBootstrapFromScript(html);
}

const YTCFG_SET_TOKEN = "ytcfg.set";
const YTCFG_VAR_TOKEN = "var ytcfg";

function parseBootstrapFromScript(source: string): Record<string, unknown> | null {
  const sanitizedSource = sanitizeYoutubeJsonResponse(source.trimStart());

  for (let index = 0; index >= 0; ) {
    index = sanitizedSource.indexOf(YTCFG_SET_TOKEN, index);
    if (index < 0) break;
    const object = extractBalancedJsonObject(sanitizedSource, index);
    if (object) {
      try {
        const parsed: unknown = JSON.parse(object);
        if (isRecord(parsed)) return parsed;
      } catch {
        // keep searching
      }
    }
    index += YTCFG_SET_TOKEN.length;
  }

  const varIndex = sanitizedSource.indexOf(YTCFG_VAR_TOKEN);
  if (varIndex >= 0) {
    const object = extractBalancedJsonObject(sanitizedSource, varIndex);
    if (object) {
      try {
        const parsed: unknown = JSON.parse(object);
        if (isRecord(parsed)) return parsed;
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function extractBalancedJsonObject(source: string, startAt: number): string | null {
  const start = source.indexOf("{", startAt);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (!ch) continue;

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (ch === "\\") {
        escaping = true;
        continue;
      }
      if (quote && ch === quote) {
        inString = false;
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}
