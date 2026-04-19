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

const STUB_YOUTUBE_MARKDOWN = `# Introduction to Machine Learning Fundamentals

## [0:00]
Welcome to this comprehensive introduction to machine learning. Today we will cover
the fundamental concepts that every practitioner needs to understand. Machine learning
is transforming industries from healthcare to finance to transportation, and
understanding the basics is essential for anyone working in technology today.

## [1:00]
Machine learning is a subset of artificial intelligence where systems learn from data
rather than being explicitly programmed. Instead of writing rules by hand, we provide
examples and let algorithms discover patterns automatically. This paradigm shift has
enabled breakthroughs in image recognition, natural language processing, and
recommendation systems that would have been impossible with traditional programming.

## [2:00]
There are three main categories of machine learning. Supervised learning uses labeled
training data to learn a mapping from inputs to outputs. Common tasks include
classification, where we predict discrete categories, and regression, where we predict
continuous values. Examples include spam detection, medical diagnosis, and house price
prediction.

## [3:00]
Unsupervised learning works with unlabeled data, discovering hidden structure and
patterns. Clustering algorithms group similar data points together, while dimensionality
reduction techniques compress high-dimensional data into lower-dimensional
representations. These techniques are invaluable for exploratory data analysis and
feature engineering.

## [4:00]
Reinforcement learning takes a different approach entirely. An agent interacts with an
environment, taking actions and receiving rewards or penalties. Over time, the agent
learns a policy that maximizes cumulative reward. This paradigm powers game-playing AIs,
robotics control systems, and recommendation engines that adapt to user behavior in
real time.

## [5:00]
The training process involves splitting data into training, validation, and test sets.
We fit the model on training data, tune hyperparameters using validation data, and
evaluate final performance on the held-out test set. Cross-validation provides more
robust estimates by rotating which subset serves as the validation set. Overfitting
occurs when a model memorizes training data rather than learning generalizable patterns.

## [6:00]
Thank you for watching this introduction to machine learning. In the next video, we
will dive deeper into neural networks and deep learning architectures, exploring how
multi-layer perceptrons, convolutional networks, and transformers have revolutionized
the field. Subscribe and hit the bell icon to be notified when it drops.`;

export class StubYouTubeExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractResult> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const videoId = url.match(/[?&]v=([^&]+)/)?.[1] ?? "unknown";
    return {
      markdown: STUB_YOUTUBE_MARKDOWN,
      title: `Stub YouTube Video (${videoId})`,
      metadata: {
        provider: "stub",
        thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      },
    };
  }
}
