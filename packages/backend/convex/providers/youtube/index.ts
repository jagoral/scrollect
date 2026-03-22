import { Supadata, type TranscriptChunk } from "@supadata/js";

import type { ContentExtractor, ExtractResult } from "../types";

import {
  type TranscriptSegment,
  extractYouTubeVideoId,
  formatTimestampMs,
  normalizeTranscriptText,
} from "./utils";

const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_DURATION_MS = 300_000;

export class YouTubeTranscriptExtractor implements ContentExtractor {
  private client: Supadata;

  constructor(options: { apiKey: string }) {
    this.client = new Supadata({ apiKey: options.apiKey });
  }

  async extract(url: string): Promise<ExtractResult> {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      throw new Error(`Could not extract video ID from URL: ${url}`);
    }

    const [transcript, title] = await Promise.all([
      this.fetchTranscript(url),
      this.fetchVideoTitle(url),
    ]);

    const segments = this.mapToSegments(transcript);
    const markdown = this.transcriptToMarkdown(segments, title);

    return {
      markdown,
      title,
      metadata: { provider: "supadata", videoId, segments },
    };
  }

  private async fetchTranscript(url: string): Promise<TranscriptChunk[]> {
    const result = await this.client.transcript({ url, text: false, lang: "en" });

    // Videos >20 min return async jobId - poll until complete
    if ("jobId" in result) {
      return this.pollForTranscript(result.jobId);
    }

    if (!Array.isArray(result.content)) {
      throw new Error("Expected timestamped transcript chunks but received plain text");
    }

    return result.content;
  }

  private async pollForTranscript(jobId: string): Promise<TranscriptChunk[]> {
    const startMs = Date.now();

    while (Date.now() - startMs < MAX_POLL_DURATION_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const job = await this.client.transcript.getJobStatus(jobId);

      if (job.status === "completed" && job.result) {
        if (!Array.isArray(job.result.content)) {
          throw new Error("Expected timestamped transcript chunks but received plain text");
        }
        return job.result.content;
      }

      if (job.status === "failed") {
        const message = job.error?.message ?? "Transcript job failed";
        throw new Error(`Supadata transcript job failed: ${message}`);
      }
    }

    throw new Error(
      `Supadata transcript job ${jobId} timed out after ${MAX_POLL_DURATION_MS / 1000}s`,
    );
  }

  private async fetchVideoTitle(url: string): Promise<string | undefined> {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const response = await fetch(oembedUrl);
      if (!response.ok) return undefined;
      const data = (await response.json()) as { title?: string };
      return data.title || undefined;
    } catch {
      return undefined;
    }
  }

  private mapToSegments(chunks: TranscriptChunk[]): TranscriptSegment[] {
    return chunks
      .filter((chunk) => chunk.text.trim().length > 0)
      .map((chunk) => ({
        startMs: chunk.offset,
        endMs: chunk.offset + chunk.duration,
        text: chunk.text.replace(/\s+/g, " ").trim(),
      }));
  }

  private transcriptToMarkdown(segments: TranscriptSegment[], title?: string): string {
    const lines: string[] = [];

    if (title) {
      lines.push(`# ${title}`, "");
    }

    if (segments.length > 0) {
      let lastHeaderMs = -Infinity;
      for (const segment of segments) {
        if (segment.startMs - lastHeaderMs >= 60_000) {
          lines.push("", `## [${formatTimestampMs(segment.startMs)}]`, "");
          lastHeaderMs = segment.startMs;
        }
        lines.push(segment.text);
      }
    } else {
      lines.push(normalizeTranscriptText("No transcript content available."));
    }

    return lines.join("\n").trim();
  }
}
