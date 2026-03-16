# Connection Synthesis - Prompt Template

Spec for issue #73, derived from ADR-008. Intended for the Backend Developer implementing the connection card generation prompt.

## Architecture: separate connection generation call

Connection cards use a **dedicated LLM call** separate from the main multi-type generation call. The main call (in `buildMultiTypePrompt`) generates insight, quiz, quote, and summary cards from the selected chunks. The connection call generates connection cards from pre-discovered `ConnectionCandidate` pairs.

**Why separate from the main multi-type call:**

- The main call receives randomly sampled chunks with no cross-document signal. Asking it to also produce connections from unrelated chunks yields low-quality results (the current problem).
- Connection candidates come from a targeted vector search with quality pre-filtering. They need their own prompt context.
- A separate call lets us retry connection generation independently without re-generating other card types.
- The connection call is smaller (2 chunks per candidate vs 10+ chunks for the main call), so it is faster and cheaper.

## Prompt template

Place in `packages/backend/convex/feed/connectionPrompt.ts`:

```ts
export function buildConnectionPrompt(candidateCount: number): string {
  return `You are an AI learning assistant for Scrollect, a personal learning feed.
Your job is to synthesize connections between passages from DIFFERENT sources in a user's personal library.

You will receive ${candidateCount} candidate pair(s). Each pair contains two passages that are semantically similar based on embedding vectors. Your job is to determine whether each pair has a genuinely INSIGHTFUL connection and, if so, write a connection card.

For each candidate pair, respond with one of:

**ACCEPTED** - The pair has a non-obvious, insightful connection. Produce:
- content: 2-4 sentences explaining the connection. What conceptual bridge links these two ideas? Why is this connection valuable for learning? Use **bold** for key linking concepts.
- sourceATitleHint: brief label for source A's topic
- sourceBTitleHint: brief label for source B's topic
- sourceAKeyIdea: one sentence capturing the key idea from source A that participates in this connection
- sourceBKeyIdea: one sentence capturing the key idea from source B that participates in this connection

**REJECTED** - The pair is trivial. Respond with:
- rejected: true
- reason: one sentence explaining why (e.g., "Both passages discuss caching in general terms without a specific conceptual bridge")

Rejection criteria - REJECT the pair if:
1. The passages discuss the same broad topic without a specific conceptual bridge (e.g., both mention "scalability" but in unrelated contexts)
2. One passage is a near-paraphrase of the other
3. The connection is so obvious it provides no learning value (e.g., "both discuss programming")
4. The only connection is that both use the same technical term without building on each other's ideas

Acceptance criteria - ACCEPT the pair if:
1. The passages approach the same concept from different angles, revealing complementary perspectives
2. A principle from one source explains or contradicts a pattern in the other
3. One source provides a concrete example of an abstract idea in the other
4. The two ideas combine to form a larger insight neither contains alone

Return a JSON object: { "connections": [ { ...accepted fields OR rejected/reason fields } ] }
The array must have exactly ${candidateCount} items, one per input pair, in the same order.`;
}
```

## User prompt construction

```ts
export function buildConnectionUserPrompt(candidates: ConnectionCandidate[]): string {
  return candidates
    .map(
      (c, i) =>
        `--- Candidate Pair ${i} ---\n` +
        `Source A: "${c.anchorDocumentTitle}"` +
        (c.anchorSectionTitle ? ` (section: "${c.anchorSectionTitle}")` : "") +
        `\n${c.anchorContent}\n\n` +
        `Source B: "${c.matchDocumentTitle}"` +
        (c.matchSectionTitle ? ` (section: "${c.matchSectionTitle}")` : "") +
        `\n${c.matchContent}`,
    )
    .join("\n\n");
}
```

## Response schema

```ts
import { z } from "zod";

const connectionResponseSchema = z.object({
  connections: z.array(
    z.union([
      z.object({
        content: z.string(),
        sourceATitleHint: z.string(),
        sourceBTitleHint: z.string(),
        sourceAKeyIdea: z.string(),
        sourceBKeyIdea: z.string(),
      }),
      z.object({
        rejected: z.literal(true),
        reason: z.string(),
      }),
    ]),
  ),
});
```

## LLM call integration

```ts
export type SynthesizeConnectionsArgs = {
  candidates: ConnectionCandidate[];
  model: LanguageModel;
};

export type SynthesizedConnection = {
  candidate: ConnectionCandidate;
  content: string;
  sourceATitleHint: string;
  sourceBTitleHint: string;
  sourceAKeyIdea: string;
  sourceBKeyIdea: string;
};

export async function synthesizeConnections(
  args: SynthesizeConnectionsArgs,
): Promise<SynthesizedConnection[]> {
  // 1. Call generateText with buildConnectionPrompt + buildConnectionUserPrompt
  // 2. Parse response with connectionResponseSchema
  // 3. Filter out rejected pairs (log rejection reasons for threshold tuning)
  // 4. Map accepted pairs back to their ConnectionCandidate + generated fields
  // 5. Return SynthesizedConnection[]
}
```

## Logging for threshold tuning

Log each candidate's outcome to `WideEvent`:

```ts
evt.set("connectionCandidates", candidates.length);
evt.set("connectionAccepted", accepted.length);
evt.set("connectionRejected", rejected.length);

// Per-candidate detail for tuning the SIMILARITY_THRESHOLD
for (const [i, candidate] of candidates.entries()) {
  evt.set(`conn_${i}_score`, candidate.similarityScore);
  evt.set(`conn_${i}_outcome`, wasAccepted ? "accepted" : "rejected");
  if (!wasAccepted) {
    evt.set(`conn_${i}_reason`, rejectionReason);
  }
}
```

This data allows us to correlate similarity scores with acceptance rates. If most candidates at 0.82-0.85 are rejected, raise the threshold. If most at 0.80-0.82 are accepted, lower it.

## Integration with `generation.ts`

After `discoverConnections()` returns candidates and `synthesizeConnections()` produces accepted connections:

```ts
// In generate(), after the main multi-type LLM call:
const connectionCandidates = await discoverConnections({ ... });

let connectionCards: { card: RawCard; chunks: ChunkInfo[] }[] = [];
if (connectionCandidates.length > 0) {
  const synthesized = await synthesizeConnections({
    candidates: connectionCandidates,
    model: getAI().languageModel("fast"),
  });

  connectionCards = synthesized.map((s) => ({
    card: {
      type: "connection" as const,
      content: s.content,
      sourceChunkIndices: [], // will be remapped below
      sourceATitleHint: s.sourceATitleHint,
      sourceBTitleHint: s.sourceBTitleHint,
      sourceAKeyIdea: s.sourceAKeyIdea,
      sourceBKeyIdea: s.sourceBKeyIdea,
    },
    chunks: [
      // Map back to ChunkInfo from the candidate's chunk IDs
      anchorChunkInfo,
      matchChunkInfo,
    ],
  }));
}

// Merge connection cards into the main card list before interleaving
const allCards = [...validCards, ...connectionCards];
```

## Within-document prompt variant

For single-document users, the prompt changes slightly. Replace "DIFFERENT sources" with "different sections of the same document" in the system prompt. The acceptance/rejection criteria remain the same - cross-section connections within a long document should meet the same quality bar.

```ts
export function buildWithinDocumentConnectionPrompt(candidateCount: number): string {
  // Same structure as buildConnectionPrompt, but:
  // - "DIFFERENT sections of the same document" instead of "DIFFERENT sources"
  // - sourceATitleHint/sourceBTitleHint become section labels
  // - Rejection criterion #1 adjusted: "same section discusses the same subtopic"
  //   instead of "same broad topic"
}
```
