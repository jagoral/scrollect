import { describe, expect, it, vi } from "vitest";

import { extractContentLogic } from "../../../src/pipeline/logic/extraction";
import {
  createMockArticleExtractor,
  createMockExtractionServices,
  createMockYouTubeExtractor,
} from "./mocks";

describe("extractContentLogic", () => {
  it("extracts article content using articleExtractor", async () => {
    const articleExtractor = createMockArticleExtractor({
      extract: vi.fn().mockResolvedValue({
        markdown: "# My Article\nSome content here",
        title: "My Article",
      }),
    });
    const services = createMockExtractionServices({ articleExtractor });

    const { result, metrics } = await extractContentLogic({
      input: { sourceUrl: "https://example.com/article", extractorType: "article" },
      services,
    });

    expect(articleExtractor.extract).toHaveBeenCalledWith("https://example.com/article");
    expect(result.markdown).toBe("# My Article\nSome content here");
    expect(result.title).toBe("My Article");
    expect(metrics.markdownLength).toBe(30);
    expect(metrics.hasTitle).toBe(true);
  });

  it("extracts YouTube content using youtubeExtractor with metadata", async () => {
    const youtubeExtractor = createMockYouTubeExtractor({
      extract: vi.fn().mockResolvedValue({
        markdown: "# Video Transcript\nHello world",
        title: "Video Title",
        metadata: {
          provider: "decodo",
          duration: 120,
          thumbnailUrl: "https://i.ytimg.com/vi/abc/maxresdefault.jpg",
        },
      }),
    });
    const services = createMockExtractionServices({ youtubeExtractor });

    const { result, metrics } = await extractContentLogic({
      input: { sourceUrl: "https://youtube.com/watch?v=abc", extractorType: "youtube" },
      services,
    });

    expect(youtubeExtractor.extract).toHaveBeenCalledWith("https://youtube.com/watch?v=abc");
    expect(result.markdown).toBe("# Video Transcript\nHello world");
    expect(result.title).toBe("Video Title");
    expect(metrics.markdownLength).toBe(30);
    expect(metrics.hasTitle).toBe(true);
    expect(metrics.provider).toBe("decodo");
    expect(result.metadata?.thumbnailUrl).toBe("https://i.ytimg.com/vi/abc/maxresdefault.jpg");
  });

  it("reports hasTitle false and no provider when missing", async () => {
    const articleExtractor = createMockArticleExtractor({
      extract: vi.fn().mockResolvedValue({
        markdown: "Plain content",
      }),
    });
    const services = createMockExtractionServices({ articleExtractor });

    const { metrics } = await extractContentLogic({
      input: { sourceUrl: "https://example.com/plain", extractorType: "article" },
      services,
    });

    expect(metrics.hasTitle).toBe(false);
    expect(metrics.provider).toBeUndefined();
    expect(metrics.markdownLength).toBe(13);
  });
});
