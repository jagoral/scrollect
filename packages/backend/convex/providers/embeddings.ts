"use node";

import { embedMany, type EmbeddingModel } from "ai";
import type { EmbeddingProvider } from "./types";

export class AiSdkEmbeddings implements EmbeddingProvider {
  readonly dimensions: number;
  private model: EmbeddingModel;

  constructor(model: EmbeddingModel, dimensions: number = 1536) {
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const { embeddings } = await embedMany({
      model: this.model,
      values: texts,
    });

    return embeddings;
  }
}
