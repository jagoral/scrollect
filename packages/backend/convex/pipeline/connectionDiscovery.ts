"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureAiUsage, captureEvent } from "../../src/providers/analytics";
import type { TokenUsage } from "../../src/providers/types";

import { computeContentHash } from "./helpers";
import { buildPairKey, discoverConnections } from "../../src/pipeline/logic/connectionDiscovery";
import type {
  ChunkData,
  DocumentData,
  SectionData,
} from "../../src/pipeline/logic/connectionDiscovery";
import { createConnectionDiscoveryServiceContext } from "./services";

export const discover = internalAction({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.connectionDiscovery");
    evt.set({ documentId });
    let tokenUsage: TokenUsage | undefined;
    let userId: string | undefined;

    try {
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;
      userId = doc.userId;
      evt.set("userId", userId);

      const newDocSections = await ctx.runQuery(internal.sectionSummaries.listByDocument, {
        documentId,
      });
      evt.set("newDocSectionCount", newDocSections.length);

      if (newDocSections.length === 0) {
        evt.set("skipped", "no_sections");
        return;
      }

      const readyDocs = await ctx.runQuery(internal.documents.listReadyByUser, {
        userId,
      });
      const otherDocIds = readyDocs.filter((d) => d._id !== documentId).map((d) => d._id);

      const allDocuments = new Map<string, DocumentData>();
      allDocuments.set(documentId, { documentId, title: doc.title });
      for (const rd of readyDocs) {
        allDocuments.set(rd._id, { documentId: rd._id, title: rd.title });
      }

      const otherSections =
        otherDocIds.length > 0
          ? await ctx.runQuery(internal.sectionSummaries.listByDocuments, {
              documentIds: otherDocIds,
            })
          : [];

      const allSections = new Map<string, SectionData>();
      for (const s of newDocSections) {
        allSections.set(s._id, {
          sectionSummaryId: s._id,
          documentId: s.documentId,
          sectionTitle: s.sectionTitle,
          summary: s.summary,
          embeddingId: s.embeddingId,
          chunkStartIndex: s.chunkStartIndex,
          chunkEndIndex: s.chunkEndIndex,
        });
      }
      for (const s of otherSections) {
        allSections.set(s._id, {
          sectionSummaryId: s._id,
          documentId: s.documentId,
          sectionTitle: s.sectionTitle,
          summary: s.summary,
          embeddingId: s.embeddingId,
          chunkStartIndex: s.chunkStartIndex,
          chunkEndIndex: s.chunkEndIndex,
        });
      }

      const services = createConnectionDiscoveryServiceContext();

      const summaryTexts = newDocSections.map((s) => s.summary);
      const vectors = await services.embedder.embed(summaryTexts);

      const sectionEmbeddings = new Map<string, number[]>();
      for (let i = 0; i < newDocSections.length; i++) {
        const section = newDocSections[i]!;
        const vector = vectors[i];
        if (vector) {
          sectionEmbeddings.set(section._id, vector);
        }
      }

      const relevantDocIds = new Set<string>();
      relevantDocIds.add(documentId);
      for (const s of otherSections) {
        relevantDocIds.add(s.documentId);
      }

      const chunkResults = await Promise.all(
        Array.from(relevantDocIds).map((docId) =>
          ctx.runQuery(internal.chunks.listByDocumentInternal, {
            documentId: docId as Id<"documents">,
          }),
        ),
      );
      const allChunks: ChunkData[] = chunkResults.flat().map((c) => ({
        _id: c._id,
        content: c.content,
        chunkIndex: c.chunkIndex,
        documentId: c.documentId,
      }));

      const existingPairRecords = await ctx.runQuery(
        internal.connectionPairs.listPairKeysByUserId,
        { userId },
      );
      const existingPairKeys = new Set(
        existingPairRecords.map((p) => buildPairKey(p.sectionSummaryIdA, p.sectionSummaryIdB)),
      );

      const existingDrafts = await ctx.runQuery(internal.cardDrafts.listByDocumentStatus, {
        documentId,
        status: "pending",
      });
      const existingDraftHashes = new Set(existingDrafts.map((d) => d.contentHash));

      const newDocumentSections: SectionData[] = newDocSections.map((s) => ({
        sectionSummaryId: s._id,
        documentId: s.documentId,
        sectionTitle: s.sectionTitle,
        summary: s.summary,
        embeddingId: s.embeddingId,
        chunkStartIndex: s.chunkStartIndex,
        chunkEndIndex: s.chunkEndIndex,
      }));

      const result = await discoverConnections({
        input: {
          userId,
          language: doc.language,
          newDocument: { documentId, title: doc.title },
          newDocumentSections,
          allDocuments,
          allSections,
          allChunks,
          sectionEmbeddings,
          existingPairKeys,
          hashContent: computeContentHash,
          existingDraftHashes,
        },
        services,
      });

      tokenUsage = result.tokenUsage;
      evt.set(result.metrics);

      if (result.pairs.length > 0) {
        await ctx.runMutation(internal.connectionPairs.createBatch, {
          pairs: result.pairs.map((p) => ({
            userId: p.userId,
            sectionSummaryIdA: p.sectionSummaryIdA as Id<"sectionSummaries">,
            sectionSummaryIdB: p.sectionSummaryIdB as Id<"sectionSummaries">,
            documentIdA: p.documentIdA as Id<"documents">,
            documentIdB: p.documentIdB as Id<"documents">,
            similarityScore: p.similarityScore,
            connectionType: p.connectionType,
            status: p.status,
          })),
        });
      }

      if (result.drafts.length > 0) {
        const docCheck = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
        if (docCheck && docCheck.status !== "deleting") {
          await ctx.runMutation(internal.cardDrafts.createBatch, {
            userId,
            drafts: result.drafts.map((d) => ({
              documentId: d.documentId as Id<"documents">,
              sectionSummaryId: d.sectionSummaryId as Id<"sectionSummaries">,
              cardType: d.cardType,
              content: d.content,
              typeData: d.typeData,
              sourceChunkIds: d.sourceChunkIds as Id<"chunks">[],
              contentHash: d.contentHash,
              qualityScore: d.qualityScore,
              generationBatch: d.generationBatch,
              strategy: d.strategy,
            })),
          });
        }
      }

      if (userId) {
        await captureEvent({
          distinctId: userId,
          event: "pipeline.connection_discovery_completed",
          properties: {
            document_id: documentId,
            pairs_found: result.pairs.length,
            drafts_generated: result.drafts.length,
            within_document_fallback: result.metrics.withinDocumentFallback,
          },
        });
      }
    } catch (error) {
      // Best-effort: connection discovery failure must not propagate.
      // Document already reached "ready" status.
      evt.setError(error);
      if (userId) {
        await captureEvent({
          distinctId: userId,
          event: "pipeline.connection_discovery_failed",
          properties: {
            document_id: documentId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    } finally {
      if (tokenUsage && tokenUsage.totalTokens > 0 && userId) {
        await captureAiUsage({
          distinctId: userId,
          operation: "connection_discovery",
          documentId,
          usage: tokenUsage,
          model: tokenUsage.modelId!,
        });
      }
      evt.emit();
    }
  },
});
