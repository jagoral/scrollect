import { describe, expect, it } from "vitest";

import { getEffectiveLearningGoalEmbedding } from "../../convex/feed/learningGoal";
import type { Id } from "../../convex/_generated/dataModel";

type Assignment = {
  _id: string;
  topicId: string;
  documentId: string;
  userId: string;
  createdAt: number;
};

type TopicRow = {
  _id: string;
  learningGoalEmbedding?: number[];
};

type DocumentRow = {
  _id: string;
  learningGoalEmbedding?: number[];
};

/**
 * Minimal stub that satisfies the slice of `ctx.db` exercised by
 * `getEffectiveLearningGoalEmbedding`: a `query("documentTopics").withIndex(...).collect()`
 * call plus `db.get(...)` for topics and documents.
 */
function makeCtx(opts: {
  assignments: Assignment[];
  topics?: TopicRow[];
  documents?: DocumentRow[];
}) {
  const topics = new Map(opts.topics?.map((t) => [t._id, t]) ?? []);
  const documents = new Map(opts.documents?.map((d) => [d._id, d]) ?? []);

  return {
    db: {
      query: (table: string) => {
        if (table !== "documentTopics") {
          throw new Error(`unexpected table: ${table}`);
        }
        return {
          withIndex: (_indexName: string, fn: (q: IndexBuilder) => IndexBuilder) => {
            const builder = new IndexBuilder();
            fn(builder);
            return {
              collect: async () =>
                opts.assignments.filter((a) => a.documentId === builder.documentId),
            };
          },
        };
      },
      get: async (id: string) => {
        if (topics.has(id)) return topics.get(id);
        if (documents.has(id)) return documents.get(id);
        return null;
      },
    },
  } as unknown as Parameters<typeof getEffectiveLearningGoalEmbedding>[0];
}

class IndexBuilder {
  documentId: string | undefined;
  eq(field: string, value: string) {
    if (field === "documentId") this.documentId = value;
    return this;
  }
}

const docId = "doc1" as Id<"documents">;

describe("getEffectiveLearningGoalEmbedding", () => {
  it("prefers the topic embedding over the document embedding", async () => {
    const ctx = makeCtx({
      assignments: [{ _id: "a1", topicId: "t1", documentId: docId, userId: "u1", createdAt: 100 }],
      topics: [{ _id: "t1", learningGoalEmbedding: [1, 0, 0] }],
      documents: [{ _id: docId, learningGoalEmbedding: [0, 1, 0] }],
    });

    const result = await getEffectiveLearningGoalEmbedding(ctx, docId);
    expect(result).toEqual({ source: "topic", embedding: [1, 0, 0] });
  });

  it("falls back to the document embedding when the topic has none", async () => {
    const ctx = makeCtx({
      assignments: [{ _id: "a1", topicId: "t1", documentId: docId, userId: "u1", createdAt: 100 }],
      topics: [{ _id: "t1" /* no embedding */ }],
      documents: [{ _id: docId, learningGoalEmbedding: [0, 1, 0] }],
    });

    const result = await getEffectiveLearningGoalEmbedding(ctx, docId);
    expect(result).toEqual({ source: "document", embedding: [0, 1, 0] });
  });

  it("returns the document embedding when no topic is assigned", async () => {
    const ctx = makeCtx({
      assignments: [],
      documents: [{ _id: docId, learningGoalEmbedding: [0, 0, 1] }],
    });

    const result = await getEffectiveLearningGoalEmbedding(ctx, docId);
    expect(result).toEqual({ source: "document", embedding: [0, 0, 1] });
  });

  it("returns source:none when there is no topic and no document goal", async () => {
    const ctx = makeCtx({
      assignments: [],
      documents: [{ _id: docId /* no goal embedding */ }],
    });

    const result = await getEffectiveLearningGoalEmbedding(ctx, docId);
    expect(result).toEqual({ source: "none", embedding: undefined });
  });

  it("picks the most-recent topic when multiple assignments exist", async () => {
    const ctx = makeCtx({
      assignments: [
        { _id: "a1", topicId: "t-old", documentId: docId, userId: "u1", createdAt: 100 },
        { _id: "a2", topicId: "t-new", documentId: docId, userId: "u1", createdAt: 999 },
        { _id: "a3", topicId: "t-mid", documentId: docId, userId: "u1", createdAt: 500 },
      ],
      topics: [
        { _id: "t-old", learningGoalEmbedding: [9, 9, 9] },
        { _id: "t-mid", learningGoalEmbedding: [5, 5, 5] },
        { _id: "t-new", learningGoalEmbedding: [1, 2, 3] },
      ],
      documents: [{ _id: docId, learningGoalEmbedding: [0, 0, 0] }],
    });

    const result = await getEffectiveLearningGoalEmbedding(ctx, docId);
    expect(result).toEqual({ source: "topic", embedding: [1, 2, 3] });
  });
});
