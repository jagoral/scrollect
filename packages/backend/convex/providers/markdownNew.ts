import type { ContentExtractor, ExtractResult } from "./types";

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

    const markdown = await response.text();
    if (!markdown.trim()) {
      throw new Error("Article extraction returned empty content");
    }

    return { markdown: markdown.trim() };
  }
}
