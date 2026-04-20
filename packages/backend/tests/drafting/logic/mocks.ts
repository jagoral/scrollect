import {
  createMockEmbedder,
  createMockSummaryStore,
  createMockVectorStore,
} from "../../feed/logic/mocks";
import { ZERO_USAGE } from "../../../src/providers/llm/models";
import type {
  PostDraftLlm,
  PostDraftValidator,
  ConnectionDiscoveryLlm,
  ConnectionDiscoveryServiceContext,
  DraftPostType,
  DraftGenerationServiceContext,
  HighlightDraftGenerationServiceContext,
  HighlightDraftLlm,
  ThematicDraftGenerationServiceContext,
  ThematicLlm,
} from "../../../src/providers/types";

export function createMockPostDraftLlm(overrides?: Partial<PostDraftLlm>): PostDraftLlm {
  return {
    generateDraft: async (opts: {
      postType: DraftPostType;
      sectionSummary: string;
      sectionTitle: string;
      chunks: Array<{ content: string; chunkId: string }>;
      documentTitle: string;
      learningGoal?: string;
    }) => ({
      draft: {
        content: `Draft ${opts.postType} for "${opts.sectionTitle}": a useful learning post.`,
        typeData: buildMockTypeData(opts.postType),
      },
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

export function createMockPostDraftValidator(
  overrides?: Partial<PostDraftValidator>,
): PostDraftValidator {
  return {
    validateDraft: async () => ({
      isValid: true,
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

function buildMockTypeData(postType: DraftPostType): Record<string, unknown> {
  switch (postType) {
    case "insight":
      return { type: "insight" };
    case "quiz":
      return {
        type: "quiz",
        variant: "multiple_choice",
        question: "What is the key concept?",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctIndex: 0,
        explanation: "Option A is correct because of the key concept.",
      };
    case "quote":
      return {
        type: "quote",
        quotedText: "This is a notable passage from the source material.",
      };
    case "summary":
      return {
        type: "summary",
        bulletPoints: ["First key takeaway", "Second key takeaway"],
      };
  }
}

export function createMockDraftGenerationServices(
  overrides?: Partial<DraftGenerationServiceContext>,
): DraftGenerationServiceContext {
  return {
    llm: createMockPostDraftLlm(),
    validator: createMockPostDraftValidator(),
    ...overrides,
  };
}

export function createMockThematicLlm(overrides?: Partial<ThematicLlm>): ThematicLlm {
  return {
    discoverThemes: async (opts: {
      sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
      documentTitle: string;
      language?: string;
      learningGoal?: string;
    }) => ({
      themes: [
        {
          title: "Core Concepts",
          description: "The fundamental ideas that connect multiple sections.",
          relevantSections: opts.sectionSummaries.slice(0, 2).map((s) => s.sectionTitle),
        },
      ],
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

export function createMockThematicDraftGenerationServices(
  overrides?: Partial<ThematicDraftGenerationServiceContext>,
): ThematicDraftGenerationServiceContext {
  return {
    thematicLlm: createMockThematicLlm(),
    draftLlm: createMockPostDraftLlm(),
    embedder: createMockEmbedder(),
    vectorStore: createMockVectorStore(),
    ...overrides,
  };
}

export function createMockConnectionDiscoveryLlm(
  overrides?: Partial<ConnectionDiscoveryLlm>,
): ConnectionDiscoveryLlm {
  return {
    generateConnectionDraft: async (opts) => ({
      draft: {
        content: `Connection between "${opts.sectionA.title}" and "${opts.sectionB.title}": meaningful conceptual link.`,
        typeData: {
          type: "connection",
          sourceATitleHint: opts.documentATitle,
          sourceBTitleHint: opts.documentBTitle,
          sourceAKeyIdea: `Key idea from ${opts.sectionA.title}`,
          sourceBKeyIdea: `Key idea from ${opts.sectionB.title}`,
        },
      },
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

export function createMockConnectionDiscoveryServices(
  overrides?: Partial<ConnectionDiscoveryServiceContext>,
): ConnectionDiscoveryServiceContext {
  return {
    llm: createMockConnectionDiscoveryLlm(),
    summaryStore: createMockSummaryStore(),
    embedder: createMockEmbedder(),
    ...overrides,
  };
}

export function createMockHighlightDraftLlm(
  overrides?: Partial<HighlightDraftLlm>,
): HighlightDraftLlm {
  return {
    generateDraftsFromHighlights: async (opts: {
      highlights: Array<{ highlightId: string; highlightText: string }>;
      sectionSummary: string;
      sectionTitle: string;
      chunks: Array<{ content: string; chunkId: string }>;
      documentTitle: string;
      language?: string;
      learningGoal?: string;
    }) => ({
      drafts: opts.highlights.map((h) => ({
        highlightId: h.highlightId,
        content: `Insight from highlight in "${opts.sectionTitle}": ${h.highlightText.slice(0, 50)}`,
        postType: "insight" as DraftPostType,
        typeData: { type: "insight" },
      })),
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

export function createMockHighlightDraftGenerationServices(
  overrides?: Partial<HighlightDraftGenerationServiceContext>,
): HighlightDraftGenerationServiceContext {
  return {
    llm: createMockHighlightDraftLlm(),
    ...overrides,
  };
}

export {
  createMockEmbedder,
  createMockSummaryStore,
  createMockVectorStore,
} from "../../feed/logic/mocks";
