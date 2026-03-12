/**
 * YouTubeTranscriptExtractor — 3-level HTTP-only fallback chain.
 *
 * Ported from @steipete/summarize-core by Peter Steinberger.
 * Original: https://github.com/steipete/summarize/tree/main/packages/core/src/content/transcript/providers/youtube/
 * License: MIT — https://github.com/steipete/summarize/blob/main/LICENSE
 */

import type { ContentExtractor, ExtractResult } from "../types";

import { extractYoutubeiTranscriptConfig, fetchTranscriptFromTranscriptEndpoint } from "./api";
import { fetchTranscriptWithApify } from "./apify";
import { fetchTranscriptFromCaptionTracks } from "./captions";
import {
  type TranscriptSegment,
  extractYouTubeVideoId,
  formatTimestampMs,
  normalizeTranscriptText,
} from "./utils";

const WATCH_PAGE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

export class YouTubeTranscriptExtractor implements ContentExtractor {
  private apifyApiToken: string | null;

  constructor(options?: { apifyApiToken?: string }) {
    this.apifyApiToken = options?.apifyApiToken ?? null;
  }

  async extract(url: string): Promise<ExtractResult> {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      throw new Error(`Could not extract video ID from URL: ${url}`);
    }

    // Fetch the YouTube watch page HTML
    const htmlText = await this.fetchWatchPageHtml(url);
    if (!htmlText) {
      throw new Error("Failed to fetch YouTube watch page");
    }

    // Extract video title from HTML
    const title = this.extractTitle(htmlText);

    // Level 1: YouTubei transcript endpoint
    const config = extractYoutubeiTranscriptConfig(htmlText);
    if (config) {
      const result = await fetchTranscriptFromTranscriptEndpoint(config, url);
      if (result?.text) {
        const markdown = this.transcriptToMarkdown(result.text, result.segments, title);
        return {
          markdown,
          title,
          metadata: { provider: "youtubei", videoId, segments: result.segments },
        };
      }
    }

    // Level 2: Caption tracks (player API + Android fallback)
    const captionResult = await fetchTranscriptFromCaptionTracks({
      html: htmlText,
      originalUrl: url,
      videoId,
    });
    if (captionResult?.text) {
      const markdown = this.transcriptToMarkdown(captionResult.text, captionResult.segments, title);
      return {
        markdown,
        title,
        metadata: { provider: "captionTracks", videoId, segments: captionResult.segments },
      };
    }

    // Level 3: Apify (optional, requires token)
    if (this.apifyApiToken) {
      const apifyText = await fetchTranscriptWithApify(this.apifyApiToken, url);
      if (apifyText) {
        const markdown = this.transcriptToMarkdown(apifyText, null, title);
        return {
          markdown,
          title,
          metadata: { provider: "apify", videoId },
        };
      }
    }

    throw new Error(
      "No transcript available for this video. The video may not have captions, or it may be private/age-restricted.",
    );
  }

  private async fetchWatchPageHtml(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, { headers: WATCH_PAGE_HEADERS });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  private extractTitle(html: string): string | undefined {
    // Try og:title meta tag
    const ogMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
    if (ogMatch?.[1]) return this.decodeHtml(ogMatch[1]);

    // Try <title> tag
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch?.[1]) {
      const raw = titleMatch[1].replace(/ - YouTube$/, "").trim();
      if (raw) return this.decodeHtml(raw);
    }

    return undefined;
  }

  private decodeHtml(input: string): string {
    return input
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'");
  }

  private transcriptToMarkdown(
    text: string,
    segments: TranscriptSegment[] | null,
    title?: string,
  ): string {
    const normalized = normalizeTranscriptText(text);
    const lines: string[] = [];

    if (title) {
      lines.push(`# ${title}`, "");
    }

    if (segments && segments.length > 0) {
      // Format with timestamp section headers every ~60 seconds
      let lastHeaderMs = -Infinity;
      for (const segment of segments) {
        if (segment.startMs - lastHeaderMs >= 60_000) {
          lines.push("", `## [${formatTimestampMs(segment.startMs)}]`, "");
          lastHeaderMs = segment.startMs;
        }
        lines.push(segment.text.replace(/\s+/g, " ").trim());
      }
    } else {
      lines.push(normalized);
    }

    return lines.join("\n").trim();
  }
}
