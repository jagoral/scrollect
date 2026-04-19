import type { TaggingServiceContext, TokenUsage } from "../../providers/types";

const MAX_SAMPLE_CHUNKS = 5;
const MAX_CHUNK_CHARS = 1500;

export type TaggingInput = {
  chunks: Array<{ content: string }>;
};

export type TaggingMetrics = {
  sampledChunks: number;
  suggestedTags: number;
  validTags: number;
};

export type TaggingResult = {
  tags: string[];
  usage: TokenUsage;
  metrics: TaggingMetrics;
};

export function sampleChunks<T>(chunks: T[], maxSamples: number): T[] {
  if (chunks.length <= maxSamples) return chunks;

  const indices: number[] = [0];
  const remaining = maxSamples - 2;
  const step = (chunks.length - 1) / (remaining + 1);
  for (let i = 1; i <= remaining; i++) {
    indices.push(Math.round(step * i));
  }
  indices.push(chunks.length - 1);

  return [...new Set(indices)].sort((a, b) => a - b).map((i) => chunks[i]!);
}

export async function suggestTagsLogic({
  input,
  services,
}: {
  input: TaggingInput;
  services: TaggingServiceContext;
}): Promise<TaggingResult> {
  const sampled = sampleChunks(input.chunks, MAX_SAMPLE_CHUNKS);

  const prompt = sampled
    .map((chunk, i) => {
      const content =
        chunk.content.length > MAX_CHUNK_CHARS
          ? chunk.content.slice(0, MAX_CHUNK_CHARS) + "..."
          : chunk.content;
      return `Chunk ${i + 1}:\n${content}`;
    })
    .join("\n\n---\n\n");

  const { tags: rawTags, usage } = await services.llm.suggestTags({ prompt });

  const validTags = rawTags
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .slice(0, 5);

  const metrics: TaggingMetrics = {
    sampledChunks: sampled.length,
    suggestedTags: rawTags.length,
    validTags: validTags.length,
  };

  return { tags: validTags, usage, metrics };
}
