import type { EmbeddingProvider } from "./types";

export class OpenAIEmbeddings implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  readonly dimensions: number;

  constructor(apiKey: string, model: string = "text-embedding-3-small", dimensions: number = 1536) {
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${JSON.stringify(data)}`);
    }

    // Sort by index to guarantee order matches input
    return data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding);
  }
}
