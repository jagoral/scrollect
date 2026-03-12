/**
 * YouTubei transcript endpoint extraction.
 *
 * Ported from @steipete/summarize-core by Peter Steinberger.
 * Original: https://github.com/steipete/summarize/blob/main/packages/core/src/content/transcript/providers/youtube/api.ts
 * License: MIT — https://github.com/steipete/summarize/blob/main/LICENSE
 */

import {
  type TranscriptSegment,
  extractYoutubeBootstrapConfig,
  fetchWithTimeout,
  isRecord,
  parseTimestampToMs,
} from "./utils";

export interface YoutubeTranscriptConfig {
  apiKey: string;
  context: Record<string, unknown>;
  params: string;
  visitorData?: string | null;
  clientName?: string | null;
  clientVersion?: string | null;
  pageCl?: number | null;
  pageLabel?: string | null;
}

export interface YoutubeTranscriptPayload {
  text: string;
  segments: TranscriptSegment[] | null;
}

type YoutubeBootstrapConfig = Record<string, unknown> & {
  INNERTUBE_API_KEY?: unknown;
  INNERTUBE_CONTEXT?: unknown;
  INNERTUBE_CLIENT_VERSION?: unknown;
  INNERTUBE_CONTEXT_CLIENT_NAME?: unknown;
  INNERTUBE_CONTEXT_CLIENT_VERSION?: unknown;
  VISITOR_DATA?: unknown;
  PAGE_CL?: unknown;
  PAGE_BUILD_LABEL?: unknown;
  XSRF_TOKEN?: unknown;
};

type TranscriptRunRecord = Record<string, unknown> & { text?: unknown };
const GET_TRANSCRIPT_ENDPOINT_REGEX = /"getTranscriptEndpoint":\{"params":"([^"]+)"\}/;

const REQUEST_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

export function extractYoutubeiTranscriptConfig(html: string): YoutubeTranscriptConfig | null {
  try {
    const bootstrapConfig = extractYoutubeBootstrapConfig(html);
    if (!bootstrapConfig) return null;

    const parametersMatch = html.match(GET_TRANSCRIPT_ENDPOINT_REGEX);
    if (!parametersMatch?.[1]) return null;

    const parameters = parametersMatch[1];
    const typedBootstrap = bootstrapConfig as YoutubeBootstrapConfig;
    const apiKey =
      typeof typedBootstrap.INNERTUBE_API_KEY === "string"
        ? typedBootstrap.INNERTUBE_API_KEY
        : null;
    const context = isRecord(typedBootstrap.INNERTUBE_CONTEXT)
      ? typedBootstrap.INNERTUBE_CONTEXT
      : null;

    if (!(apiKey && context)) return null;

    const contextClient = isRecord((context as Record<string, unknown>).client)
      ? ((context as Record<string, unknown>).client as Record<string, unknown>)
      : null;
    const visitorData =
      (typeof typedBootstrap.VISITOR_DATA === "string" ? typedBootstrap.VISITOR_DATA : null) ??
      (typeof contextClient?.visitorData === "string"
        ? (contextClient.visitorData as string)
        : null);
    const clientNameCandidate = typedBootstrap.INNERTUBE_CONTEXT_CLIENT_NAME;
    const clientName =
      typeof clientNameCandidate === "number"
        ? String(clientNameCandidate)
        : typeof clientNameCandidate === "string"
          ? clientNameCandidate
          : null;
    const clientVersion =
      typeof typedBootstrap.INNERTUBE_CONTEXT_CLIENT_VERSION === "string"
        ? typedBootstrap.INNERTUBE_CONTEXT_CLIENT_VERSION
        : null;
    const pageCl = typeof typedBootstrap.PAGE_CL === "number" ? typedBootstrap.PAGE_CL : null;
    const pageLabel =
      typeof typedBootstrap.PAGE_BUILD_LABEL === "string" ? typedBootstrap.PAGE_BUILD_LABEL : null;

    return {
      apiKey,
      context,
      params: parameters,
      visitorData,
      clientName,
      clientVersion,
      pageCl,
      pageLabel,
    };
  } catch {
    return null;
  }
}

export async function fetchTranscriptFromTranscriptEndpoint(
  config: YoutubeTranscriptConfig,
  originalUrl: string,
): Promise<YoutubeTranscriptPayload | null> {
  const contextRecord = config.context as Record<string, unknown> & { client?: unknown };
  const existingClient = isRecord(contextRecord.client)
    ? (contextRecord.client as Record<string, unknown>)
    : {};

  const payload = {
    context: {
      ...contextRecord,
      client: { ...existingClient, originalUrl },
    },
    params: config.params,
  };

  try {
    const userAgent = REQUEST_HEADERS["User-Agent"]!;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": userAgent,
      Accept: "application/json",
      Origin: "https://www.youtube.com",
      Referer: originalUrl,
      "X-Goog-AuthUser": "0",
      "X-Youtube-Bootstrap-Logged-In": "false",
    };

    if (config.clientName) headers["X-Youtube-Client-Name"] = config.clientName;
    if (config.clientVersion) headers["X-Youtube-Client-Version"] = config.clientVersion;
    if (config.visitorData) headers["X-Goog-Visitor-Id"] = config.visitorData;
    if (typeof config.pageCl === "number" && Number.isFinite(config.pageCl)) {
      headers["X-Youtube-Page-CL"] = String(config.pageCl);
    }
    if (config.pageLabel) headers["X-Youtube-Page-Label"] = config.pageLabel;

    const response = await fetchWithTimeout(
      `https://www.youtube.com/youtubei/v1/get_transcript?key=${config.apiKey}`,
      { method: "POST", headers, body: JSON.stringify(payload) },
    );

    if (!response.ok) return null;
    return extractTranscriptFromResponse(await response.json());
  } catch {
    return null;
  }
}

function getNestedProperty(object: unknown, path: string[]): unknown {
  let current: unknown = object;
  for (const key of path) {
    if (!(isRecord(current) && key in current)) return null;
    current = current[key];
  }
  return current;
}

function getArrayProperty(object: unknown, path: string[]): unknown[] | null {
  const value = getNestedProperty(object, path);
  return Array.isArray(value) ? value : null;
}

function extractTranscriptFromResponse(data: unknown): YoutubeTranscriptPayload | null {
  if (!isRecord(data)) return null;

  const actions = getArrayProperty(data, ["actions"]);
  if (!actions?.length) return null;

  const segmentList = getArrayProperty(
    getNestedProperty(
      getNestedProperty(
        getNestedProperty(
          getNestedProperty(
            getNestedProperty(getNestedProperty(actions[0], ["updateEngagementPanelAction"]), [
              "content",
            ]),
            ["transcriptRenderer"],
          ),
          ["content"],
        ),
        ["transcriptSearchPanelRenderer"],
      ),
      ["body"],
    ),
    ["transcriptSegmentListRenderer"],
  );

  const initialSegments = segmentList
    ? getArrayProperty(segmentList as unknown as Record<string, unknown>, ["initialSegments"])
    : null;
  if (!initialSegments?.length) return null;

  const lines: string[] = [];
  const segments: TranscriptSegment[] = [];

  for (const segment of initialSegments) {
    const renderer = getNestedProperty(segment, ["transcriptSegmentRenderer"]);
    if (!renderer) continue;

    const runs = getArrayProperty(getNestedProperty(renderer, ["snippet"]), ["runs"]);
    if (!runs) continue;

    const text = runs
      .map((value) => {
        if (!isRecord(value)) return "";
        return typeof (value as TranscriptRunRecord).text === "string"
          ? ((value as TranscriptRunRecord).text as string)
          : "";
      })
      .join("")
      .trim();

    if (text.length > 0) {
      lines.push(text);
      const startMs = parseTimestampToMs((renderer as Record<string, unknown>).startMs, false);
      const durationMs = parseTimestampToMs(
        (renderer as Record<string, unknown>).durationMs,
        false,
      );
      if (startMs != null) {
        segments.push({
          startMs,
          endMs: durationMs != null ? startMs + durationMs : null,
          text: text.replace(/\s+/g, " ").trim(),
        });
      }
    }
  }

  if (lines.length === 0) return null;
  return { text: lines.join("\n"), segments: segments.length > 0 ? segments : null };
}

export function extractYoutubeiBootstrap(html: string): {
  apiKey: string | null;
  context: Record<string, unknown>;
  clientVersion: string | null;
  clientName: string | null;
  visitorData: string | null;
  pageCl: number | null;
  pageLabel: string | null;
  xsrfToken: string | null;
} | null {
  try {
    const bootstrapConfig = extractYoutubeBootstrapConfig(html);
    if (!bootstrapConfig) return null;

    const typedBootstrap = bootstrapConfig as YoutubeBootstrapConfig;
    const apiKey =
      typeof typedBootstrap.INNERTUBE_API_KEY === "string"
        ? typedBootstrap.INNERTUBE_API_KEY
        : null;
    const context = isRecord(typedBootstrap.INNERTUBE_CONTEXT)
      ? typedBootstrap.INNERTUBE_CONTEXT
      : null;
    if (!context) return null;

    const clientVersion =
      typeof typedBootstrap.INNERTUBE_CLIENT_VERSION === "string"
        ? typedBootstrap.INNERTUBE_CLIENT_VERSION
        : null;
    const clientNameCandidate = typedBootstrap.INNERTUBE_CONTEXT_CLIENT_NAME;
    const clientName =
      typeof clientNameCandidate === "number"
        ? String(clientNameCandidate)
        : typeof clientNameCandidate === "string"
          ? clientNameCandidate
          : null;
    const contextClient = isRecord((context as Record<string, unknown>).client)
      ? ((context as Record<string, unknown>).client as Record<string, unknown>)
      : null;
    const visitorData =
      typeof contextClient?.visitorData === "string" ? (contextClient.visitorData as string) : null;
    const pageCl = typeof typedBootstrap.PAGE_CL === "number" ? typedBootstrap.PAGE_CL : null;
    const pageLabel =
      typeof typedBootstrap.PAGE_BUILD_LABEL === "string" ? typedBootstrap.PAGE_BUILD_LABEL : null;
    const xsrfToken =
      typeof typedBootstrap.XSRF_TOKEN === "string" ? typedBootstrap.XSRF_TOKEN : null;

    return {
      apiKey,
      context,
      clientVersion,
      clientName,
      visitorData,
      pageCl,
      pageLabel,
      xsrfToken,
    };
  } catch {
    return null;
  }
}
