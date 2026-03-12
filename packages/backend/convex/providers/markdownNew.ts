import type { ContentExtractor, ExtractResult } from "./types";

interface MarkdownNewResponse {
  success: boolean;
  url: string;
  title?: string;
  content: string;
  method: string;
  duration_ms: number;
  tokens: number;
}

export class MarkdownNewArticleExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractResult> {
    const response = await fetch("https://markdown.new/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, method: "auto" }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Article extraction failed (${response.status}): ${errorText || response.statusText}`,
      );
    }

    const data: MarkdownNewResponse = await response.json();
    if (!data.content?.trim()) {
      throw new Error("Article extraction returned empty content");
    }

    return {
      markdown: data.content.trim(),
      title: data.title,
    };
  }
}
