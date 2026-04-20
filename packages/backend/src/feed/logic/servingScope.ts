import { DEFAULT_SCORING_CONFIG } from "./scoring";
import type { ScoringConfig } from "./scoring";

export type ServingScope = { kind: "all" } | { kind: "document"; documentId: string };

export type EmptyReason = "no_drafts" | "processing";

export const PROCESSING_STAGE_VALUES = [
  "uploaded",
  "parsing",
  "chunking",
  "embedding",
  "summarizing",
  "generating_cards",
] as const;

const PROCESSING_STAGES: ReadonlySet<string> = new Set(PROCESSING_STAGE_VALUES);

export function allFeedScope(): ServingScope {
  return { kind: "all" };
}

export function documentFeedScope(documentId: string): ServingScope {
  return { kind: "document", documentId };
}

export function servingScopeLabel(scope: ServingScope): "all" | "document" {
  return scope.kind;
}

export function servingScopeDocumentId(scope: ServingScope): string | undefined {
  return scope.kind === "document" ? scope.documentId : undefined;
}

export function buildServingConfig(scope: ServingScope): ScoringConfig {
  if (scope.kind === "document") {
    return { ...DEFAULT_SCORING_CONFIG, documentDiversityCap: 1 };
  }
  return DEFAULT_SCORING_CONFIG;
}

export function shouldScheduleReplenishmentForScope(input: {
  scope: ServingScope;
  remainingPending: number;
  config: ScoringConfig;
}): boolean {
  if (input.scope.kind !== "all") return false;
  return input.remainingPending < input.config.replenishmentThreshold;
}

export function determineEmptyReasonForScope(input: {
  scope: ServingScope;
  documentStatus?: string;
  hasAnyDocument: boolean;
  hasProcessingDocument: boolean;
}): EmptyReason {
  if (input.scope.kind === "document") {
    return input.documentStatus && PROCESSING_STAGES.has(input.documentStatus)
      ? "processing"
      : "no_drafts";
  }

  if (!input.hasAnyDocument) return "no_drafts";
  return input.hasProcessingDocument ? "processing" : "no_drafts";
}
