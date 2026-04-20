import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc, Id } from "../../_generated/dataModel";
import { UNGROUPED_SENTINEL } from "../../../src/feed/logic/constants";

type MutationCtx = GenericMutationCtx<DataModel>;

export type Attribution = {
  sectionTitle: string | undefined;
  pageStart: number | undefined;
  pageEnd: number | undefined;
};

type ScoredDraftRef = { id: string };

export async function resolveAttributions(
  ctx: MutationCtx,
  params: {
    topDrafts: ScoredDraftRef[];
    draftMap: Map<string, Doc<"postDrafts">>;
    sectionMap: Map<string, Doc<"sectionSummaries"> | null>;
  },
): Promise<Map<string, Attribution>> {
  const noAttribution: Attribution = {
    sectionTitle: undefined,
    pageStart: undefined,
    pageEnd: undefined,
  };

  const uniqueSectionIds = [
    ...new Set(
      params.topDrafts
        .map((draft) => params.draftMap.get(draft.id)?.sectionSummaryId)
        .filter((id): id is Id<"sectionSummaries"> => id !== undefined),
    ),
  ];

  const scopedSectionMap = new Map<string, Doc<"sectionSummaries"> | null>();
  for (const id of uniqueSectionIds) {
    scopedSectionMap.set(id as string, params.sectionMap.get(id as string) ?? null);
  }

  const chunkKeysToFetch = collectAttributionChunkKeys({
    topDrafts: params.topDrafts,
    draftMap: params.draftMap,
    sectionMap: scopedSectionMap,
  });

  const chunks = await Promise.all(
    chunkKeysToFetch.map((key) =>
      ctx.db
        .query("chunks")
        .withIndex("by_documentId_chunkIndex", (q) =>
          q.eq("documentId", key.documentId).eq("chunkIndex", key.chunkIndex),
        )
        .first(),
    ),
  );

  const chunkMap = new Map(
    chunkKeysToFetch.map((key, i) => [`${key.documentId}:${key.chunkIndex}`, chunks[i]]),
  );

  const result = new Map<string, Attribution>();
  for (const scored of params.topDrafts) {
    const draft = params.draftMap.get(scored.id)!;
    if (!draft.sectionSummaryId) {
      result.set(scored.id, noAttribution);
      continue;
    }

    const section = scopedSectionMap.get(draft.sectionSummaryId);
    if (!section) {
      result.set(scored.id, noAttribution);
      continue;
    }

    const sectionTitle =
      section.sectionTitle === UNGROUPED_SENTINEL ? undefined : section.sectionTitle;
    const startChunk = chunkMap.get(`${draft.documentId}:${section.chunkStartIndex}`);
    const endChunk =
      section.chunkStartIndex === section.chunkEndIndex
        ? startChunk
        : chunkMap.get(`${draft.documentId}:${section.chunkEndIndex}`);

    result.set(scored.id, {
      sectionTitle,
      pageStart: startChunk?.pageNumber,
      pageEnd: endChunk?.pageNumber,
    });
  }

  return result;
}

function collectAttributionChunkKeys(input: {
  topDrafts: ScoredDraftRef[];
  draftMap: Map<string, Doc<"postDrafts">>;
  sectionMap: Map<string, Doc<"sectionSummaries"> | null>;
}): Array<{ documentId: Id<"documents">; chunkIndex: number }> {
  const keys: Array<{ documentId: Id<"documents">; chunkIndex: number }> = [];

  for (const section of input.sectionMap.values()) {
    if (!section) continue;
    const scoredDraft = input.topDrafts.find(
      (draft) => input.draftMap.get(draft.id)?.sectionSummaryId === section._id,
    );
    if (!scoredDraft) continue;
    const draft = input.draftMap.get(scoredDraft.id)!;

    keys.push({ documentId: draft.documentId, chunkIndex: section.chunkStartIndex });
    if (section.chunkStartIndex !== section.chunkEndIndex) {
      keys.push({ documentId: draft.documentId, chunkIndex: section.chunkEndIndex });
    }
  }

  return [...new Map(keys.map((key) => [`${key.documentId}:${key.chunkIndex}`, key])).values()];
}
