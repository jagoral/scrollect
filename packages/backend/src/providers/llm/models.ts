import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { EmbeddingModelV3, LanguageModelV3 } from "@ai-sdk/provider";
import { Output, customProvider, generateText } from "ai"; // oxlint-disable-line no-restricted-imports
import { mapValues } from "es-toolkit";
import type { z } from "zod";

export type CostUsd = { input: number; output: number; total: number };

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelId?: ModelAlias;
  costUsd: CostUsd;
};

const ZERO_COST: CostUsd = Object.freeze({ input: 0, output: 0, total: 0 });

export const ZERO_USAGE: TokenUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUsd: ZERO_COST,
});

export function normalizeUsage(
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number },
  modelId?: ModelAlias,
): TokenUsage {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? 0;
  const costUsd = modelId ? calculateModelCost(modelId, { inputTokens, outputTokens }) : ZERO_COST;
  return { inputTokens, outputTokens, totalTokens, modelId, costUsd };
}

export function addUsage(...usages: TokenUsage[]): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let modelId: ModelAlias | undefined;
  let costInput = 0;
  let costOutput = 0;
  for (const u of usages) {
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
    totalTokens += u.totalTokens;
    modelId ??= u.modelId;
    costInput += u.costUsd.input;
    costOutput += u.costUsd.output;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    modelId,
    costUsd: { input: costInput, output: costOutput, total: costInput + costOutput },
  };
}

type ModelCost = { input: number; output: number };
type ModelUsage = { inputTokens: number; outputTokens: number };

type LanguageModelDef = () => { model: LanguageModelV3; costPerMillionTokens: ModelCost };
type EmbeddingModelDef = () => { model: EmbeddingModelV3; costPerMillionTokens: ModelCost };

let _google: ReturnType<typeof createGoogleGenerativeAI> | null = null;

function getGoogle() {
  if (_google) return _google;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is required");
  _google = createGoogleGenerativeAI({ apiKey });
  return _google;
}

const LANGUAGE_MODELS = {
  classify: () => ({
    model: getGoogle()("gemini-3.1-flash-lite-preview"),
    costPerMillionTokens: { input: 0.075, output: 0.3 },
  }),
  fast: () => ({
    model: getGoogle()("gemini-3.1-flash-lite-preview"),
    costPerMillionTokens: { input: 0.075, output: 0.3 },
  }),
  generate: () => ({
    model: getGoogle()("gemini-3.1-flash-lite-preview"),
    costPerMillionTokens: { input: 0.075, output: 0.3 },
  }),
  reason: () => ({
    model: getGoogle()("gemini-3.1-flash-lite-preview"),
    costPerMillionTokens: { input: 0.075, output: 0.3 },
  }),
  premium: () => ({
    model: getGoogle()("gemini-3.1-flash-lite-preview"),
    costPerMillionTokens: { input: 0.075, output: 0.3 },
  }),
  evaluate: () => ({
    model: getGoogle()("gemini-2.5-flash"),
    costPerMillionTokens: { input: 0.15, output: 0.6 },
  }),
} satisfies Record<string, LanguageModelDef>;

const EMBEDDING_MODELS = {
  embedding: () => {
    if (!process.env.OPENAI_API_KEY)
      throw new Error("OPENAI_API_KEY environment variable is required");
    return {
      model: openai.embeddingModel("text-embedding-3-small"),
      costPerMillionTokens: { input: 0.02, output: 0 },
    };
  },
} satisfies Record<string, EmbeddingModelDef>;

let _languageModels: Record<keyof typeof LANGUAGE_MODELS, ReturnType<LanguageModelDef>> | null =
  null;
let _embeddingModels: Record<keyof typeof EMBEDDING_MODELS, ReturnType<EmbeddingModelDef>> | null =
  null;

type LanguageModels = Record<keyof typeof LANGUAGE_MODELS, ReturnType<LanguageModelDef>["model"]>;
type EmbeddingModels = Record<
  keyof typeof EMBEDDING_MODELS,
  ReturnType<EmbeddingModelDef>["model"]
>;

function getLanguageModels(): NonNullable<typeof _languageModels> {
  if (_languageModels) {
    return _languageModels;
  }
  _languageModels = mapValues(LANGUAGE_MODELS, (def) => def());
  return _languageModels;
}

function getEmbeddingModels(): NonNullable<typeof _embeddingModels> {
  if (_embeddingModels) {
    return _embeddingModels;
  }
  _embeddingModels = mapValues(EMBEDDING_MODELS, (def) => def());
  return _embeddingModels;
}

let _ai: ReturnType<
  typeof customProvider<LanguageModels, EmbeddingModels, {}, {}, {}, {}, {}>
> | null = null;

export function getAI() {
  if (!_ai) {
    _ai = customProvider({
      languageModels: mapValues(getLanguageModels(), (model) => model.model),
      embeddingModels: mapValues(getEmbeddingModels(), (model) => model.model),
    });
  }
  return _ai;
}

export type ModelAlias = keyof typeof LANGUAGE_MODELS | keyof typeof EMBEDDING_MODELS;

export async function generate<T extends z.ZodType>(opts: {
  model: ModelAlias;
  schema: T;
  system: string;
  prompt: string;
  temperature?: number;
  maxRetries?: number;
}): Promise<{ output: z.infer<T> | null; usage: TokenUsage }> {
  const { output, usage } = await generateText({
    model: getAI().languageModel(opts.model),
    output: Output.object({ schema: opts.schema }),
    system: opts.system,
    prompt: opts.prompt,
    temperature: opts.temperature,
    maxRetries: opts.maxRetries ?? 2,
  });
  return { output: output as z.infer<T> | null, usage: normalizeUsage(usage, opts.model) };
}

const MODEL_COSTS: Record<ModelAlias, ModelCost> = {
  classify: { input: 0.075, output: 0.3 },
  fast: { input: 0.075, output: 0.3 },
  generate: { input: 0.075, output: 0.3 },
  reason: { input: 0.075, output: 0.3 },
  premium: { input: 0.075, output: 0.3 },
  evaluate: { input: 0.15, output: 0.6 },
  embedding: { input: 0.02, output: 0 },
};

export function calculateModelCost(alias: ModelAlias, usage: ModelUsage): CostUsd {
  const cost = MODEL_COSTS[alias];
  const input = (usage.inputTokens * cost.input) / 1_000_000;
  const output = (usage.outputTokens * cost.output) / 1_000_000;
  return { input, output, total: input + output };
}
