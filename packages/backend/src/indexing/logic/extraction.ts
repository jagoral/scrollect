import type { ExtractionServiceContext, ExtractResult } from "../../providers/types";

export type ExtractionInput = {
  sourceUrl: string;
  extractorType: "article" | "youtube";
};

export type ExtractionMetrics = {
  markdownLength: number;
  hasTitle: boolean;
  provider?: string;
};

export type ExtractionResult = {
  result: ExtractResult;
  metrics: ExtractionMetrics;
};

export async function extractContentLogic({
  input,
  services,
}: {
  input: ExtractionInput;
  services: ExtractionServiceContext;
}): Promise<ExtractionResult> {
  const extractor =
    input.extractorType === "article" ? services.articleExtractor : services.youtubeExtractor;

  const result = await extractor.extract(input.sourceUrl);

  const metrics: ExtractionMetrics = {
    markdownLength: result.markdown.length,
    hasTitle: !!result.title,
  };

  if (result.metadata) {
    metrics.provider = String(result.metadata.provider);
  }

  return { result, metrics };
}
