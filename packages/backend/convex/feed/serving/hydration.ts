import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc, Id } from "../../_generated/dataModel";

type MutationCtx = GenericMutationCtx<DataModel>;

export type HydratedDraftPool = {
  documentIds: Id<"documents">[];
  documentsById: Map<string, Doc<"documents"> | null>;
  sectionsById: Map<string, Doc<"sectionSummaries"> | null>;
  draftsPerDocument: Map<string, number>;
};

export async function hydrateDraftPoolForServing(
  ctx: MutationCtx,
  params: { drafts: Doc<"postDrafts">[] },
): Promise<HydratedDraftPool> {
  const documentIds = [...new Set(params.drafts.map((draft) => draft.documentId))];
  const documents = await Promise.all(documentIds.map((id) => ctx.db.get(id)));
  const documentsById = new Map(documentIds.map((id, i) => [id as string, documents[i]]));

  const draftsPerDocument = new Map<string, number>();
  for (const draft of params.drafts) {
    draftsPerDocument.set(draft.documentId, (draftsPerDocument.get(draft.documentId) ?? 0) + 1);
  }

  const sectionIds = [
    ...new Set(
      params.drafts
        .map((draft) => draft.sectionSummaryId)
        .filter((id): id is Id<"sectionSummaries"> => id !== undefined),
    ),
  ];
  const sections = await Promise.all(sectionIds.map((id) => ctx.db.get(id)));
  const sectionsById = new Map(sectionIds.map((id, i) => [id as string, sections[i]]));

  return { documentIds, documentsById, sectionsById, draftsPerDocument };
}
