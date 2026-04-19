import { maxBy } from "es-toolkit";

import type { ContentExtractor, ExtractResult } from "../../types";

import { type TranscriptSegment, extractYouTubeVideoId, formatTimestampMs } from "./utils";

const REQUEST_TIMEOUT_MS = 120_000;

type DecodoSubtitleSeg = {
  utf8: string;
  tOffsetMs?: number;
  acAsrConf?: number;
};

type DecodoSubtitleEvent = {
  tStartMs: number;
  dDurationMs: number;
  segs?: DecodoSubtitleSeg[];
  aAppend?: number;
};

type DecodoSubtitleLang = {
  events: DecodoSubtitleEvent[];
};

type DecodoSubtitleContent = {
  auto_generated?: Record<string, DecodoSubtitleLang>;
  manual?: Record<string, DecodoSubtitleLang>;
};

type DecodoMetadataContent = {
  parse_status_code: number;
  results?: {
    title: string;
    thumbnails: Array<{ height: number; url: string; width: number }>;
    duration: number;
    upload_date: string;
    uploader: string;
    chapters?: Array<{ start_time: number; title: string }>;
    video_id: string;
  };
};

type DecodoResponse<T> = {
  results: Array<{
    content: T;
    status_code: number;
    query: string;
  }>;
};

export class DecodoYouTubeExtractor implements ContentExtractor {
  private authKey: string;
  private baseUrl = "https://scraper-api.decodo.com/v2/scrape";

  constructor(options: { authKey: string }) {
    this.authKey = options.authKey;
  }

  async extract(url: string): Promise<ExtractResult> {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      throw new Error(`Could not extract video ID from URL: ${url}`);
    }

    const [subtitleResponse, metadataResponse] = await Promise.all([
      this.fetchDecodo<DecodoSubtitleContent>("youtube_subtitles", videoId),
      this.fetchDecodo<DecodoMetadataContent>("youtube_metadata", videoId),
    ]);

    const segments = this.parseSubtitles(subtitleResponse);
    if (segments.length === 0) {
      throw new Error(
        `No transcript segments found for video: ${videoId}. The video may not have captions.`,
      );
    }

    const title = metadataResponse.results?.title;
    const thumbnailUrl = this.pickBestThumbnail(metadataResponse.results?.thumbnails);
    const markdown = this.transcriptToMarkdown(segments, title);

    return {
      markdown,
      title,
      metadata: { provider: "decodo", videoId, thumbnailUrl },
    };
  }

  private async fetchDecodo<T>(target: string, query: string): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${this.authKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target, query }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Decodo API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as DecodoResponse<T>;
    const item = data.results?.[0];
    if (!item) {
      throw new Error(`Decodo returned no results for ${target} query: ${query}`);
    }

    if (item.status_code !== 200) {
      throw new Error(
        `Decodo scrape failed for ${target} query "${query}" with status ${item.status_code}`,
      );
    }

    return item.content;
  }

  private parseSubtitles(content: DecodoSubtitleContent): TranscriptSegment[] {
    if (!content) return [];

    const langData = this.pickBestSubtitleTrack(content);
    if (!langData) return [];

    return langData.events
      .filter((event) => event.segs && !event.aAppend)
      .map((event) => ({
        startMs: event.tStartMs,
        endMs: event.tStartMs + event.dDurationMs,
        text: event
          .segs!.map((seg) => seg.utf8)
          .join("")
          .replace(/\s+/g, " ")
          .trim(),
      }))
      .filter((segment) => segment.text.length > 0);
  }

  private pickBestSubtitleTrack(content: DecodoSubtitleContent): DecodoSubtitleLang | null {
    if (content.manual && Object.keys(content.manual).length > 0) {
      const lang = Object.keys(content.manual)[0]!;
      return content.manual[lang]!;
    }

    if (content.auto_generated && Object.keys(content.auto_generated).length > 0) {
      const lang = Object.keys(content.auto_generated)[0]!;
      return content.auto_generated[lang]!;
    }

    return null;
  }

  private pickBestThumbnail(
    thumbnails?: Array<{ height: number; url: string; width: number }>,
  ): string | undefined {
    if (!thumbnails || thumbnails.length === 0) return undefined;
    return maxBy(thumbnails, (t) => t.width)?.url;
  }

  private transcriptToMarkdown(segments: TranscriptSegment[], title?: string): string {
    const lines: string[] = [];

    if (title) {
      lines.push(`# ${title}`, "");
    }

    let lastHeaderMs = -Infinity;
    for (const segment of segments) {
      if (segment.startMs - lastHeaderMs >= 60_000) {
        lines.push("", `## [${formatTimestampMs(segment.startMs)}]`, "");
        lastHeaderMs = segment.startMs;
      }
      lines.push(segment.text);
    }

    return lines.join("\n").trim();
  }
}
