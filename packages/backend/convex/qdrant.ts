import { QdrantClient } from "@qdrant/js-client-rest";

const COLLECTION_NAME = "scrollect_chunks";
const VECTOR_SIZE = 1536;

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!client) {
    const url = process.env.QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;
    if (!url || !apiKey) {
      throw new Error("QDRANT_URL and QDRANT_API_KEY environment variables are required");
    }
    client = new QdrantClient({ url, apiKey });
  }
  return client;
}

export async function ensureCollection(): Promise<void> {
  const qdrant = getQdrantClient();
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
  if (!exists) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine",
      },
    });
  }
}

export { COLLECTION_NAME, VECTOR_SIZE };
