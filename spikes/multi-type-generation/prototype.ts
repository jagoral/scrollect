/**
 * Throwaway prototype: Multi-type card generation from document chunks.
 *
 * Validates that a single OpenAI call can produce multiple card types
 * (insight, quiz, quote, summary, connection) from a batch of chunks.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx spikes/multi-type-generation/prototype.ts
 */

import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardType = "insight" | "quiz" | "quote" | "summary" | "connection";

interface BaseCard {
  type: CardType;
  content: string;
  sourceChunkIndices: number[];
}

interface InsightCard extends BaseCard {
  type: "insight";
}

interface QuizCard extends BaseCard {
  type: "quiz";
  quizQuestion: string;
  quizAnswer: string;
}

interface QuoteCard extends BaseCard {
  type: "quote";
  quoteAttribution?: string;
}

interface SummaryCard extends BaseCard {
  type: "summary";
}

interface ConnectionCard extends BaseCard {
  type: "connection";
}

type Card = InsightCard | QuizCard | QuoteCard | SummaryCard | ConnectionCard;

interface GenerationResponse {
  cards: Card[];
}

// ---------------------------------------------------------------------------
// Sample chunks (simulating real document content)
// ---------------------------------------------------------------------------

const SAMPLE_CHUNKS = [
  {
    index: 0,
    documentTitle: "Deep Learning Fundamentals",
    content: `Gradient descent is an optimization algorithm used to minimize the loss function
in neural networks. The basic idea is to iteratively adjust parameters in the direction
of steepest descent. The learning rate controls the step size — too large and the
algorithm overshoots; too small and convergence is painfully slow. Modern variants like
Adam combine momentum with adaptive learning rates for faster convergence.`,
  },
  {
    index: 1,
    documentTitle: "Deep Learning Fundamentals",
    content: `"The key insight of backpropagation is that you can efficiently compute gradients
for all parameters in one backward pass through the network. This was the breakthrough
that made training deep networks practical." — Geoffrey Hinton, in a 2012 lecture at
the University of Toronto. Before backpropagation, researchers had to compute gradients
numerically, which was computationally prohibitive for networks with thousands of parameters.`,
  },
  {
    index: 2,
    documentTitle: "Deep Learning Fundamentals",
    content: `Regularization techniques prevent overfitting by adding constraints to the model.
L2 regularization (weight decay) penalizes large weights, encouraging the model to use
all features rather than relying heavily on a few. Dropout randomly disables neurons
during training, forcing the network to learn redundant representations. Batch
normalization stabilizes training by normalizing layer inputs, which also has a mild
regularizing effect.`,
  },
  {
    index: 3,
    documentTitle: "Systems Thinking for Engineers",
    content: `Feedback loops are the fundamental building blocks of complex systems. A positive
feedback loop amplifies change — think compound interest or viral growth. A negative
feedback loop dampens change — think thermostats or market corrections. Most real
systems contain both types, creating dynamic equilibria that can shift suddenly when
one loop dominates.`,
  },
  {
    index: 4,
    documentTitle: "Systems Thinking for Engineers",
    content: `Mental models are simplified representations of how something works. Engineers who
maintain multiple mental models can shift perspectives when one model fails to explain
observed behavior. Charlie Munger calls this a "latticework of mental models." The
danger is when a team shares a single mental model — they become blind to failure
modes that the model doesn't capture.`,
  },
];

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(chunkCount: number): string {
  return `You are an AI learning assistant for Scrollect, a personal learning feed app.
Your job is to transform raw text chunks from documents into engaging, bite-sized learning cards.

You MUST produce a variety of card types. Available types:

1. **insight** — A concise (2-4 sentence) card highlighting one key concept, fact, or takeaway.
   Fields: type, content, sourceChunkIndices

2. **quiz** — A flashcard with a question and a hidden answer for self-testing.
   Fields: type, content (brief context), quizQuestion, quizAnswer, sourceChunkIndices

3. **quote** — A notable passage worth remembering, with attribution if available.
   Fields: type, content (the quote, formatted with > markdown), quoteAttribution (optional), sourceChunkIndices

4. **summary** — A condensed overview synthesizing 2-5 chunks into one card.
   Fields: type, content, sourceChunkIndices (must reference 2+ chunks)

5. **connection** — Links concepts across different documents or distant sections.
   Fields: type, content, sourceChunkIndices (must reference 2+ chunks from different documents)

Rules:
- Produce ${Math.max(chunkCount, chunkCount + 2)} cards total (more cards than chunks is fine — one chunk can inspire multiple card types).
- Each card MUST include sourceChunkIndices: an array of 0-based indices referencing the input chunks.
- summary and connection cards MUST reference 2+ chunks.
- connection cards SHOULD reference chunks from different documents when possible.
- Aim for a natural mix — don't force a type that doesn't fit the material.
- Use light Markdown: **bold** for key terms, > for quotes, occasional bullet points.
- Each card should stand alone without needing other cards for context.

Return a JSON object: { "cards": [...] }`;
}

function buildUserPrompt(chunks: typeof SAMPLE_CHUNKS): string {
  return chunks
    .map((c, i) => `Chunk ${i} (from "${c.documentTitle}"):\n${c.content}`)
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

async function generate(chunks: typeof SAMPLE_CHUNKS): Promise<GenerationResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY environment variable");
  }

  const openai = new OpenAI({ apiKey });
  const model = "gpt-4o-mini";

  console.log(`\n--- Calling ${model} with ${chunks.length} chunks ---\n`);

  const start = performance.now();

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(chunks.length) },
      { role: "user", content: buildUserPrompt(chunks) },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const elapsed = Math.round(performance.now() - start);
  const raw = response.choices[0]?.message?.content ?? "{}";

  console.log(`Response received in ${elapsed}ms`);
  console.log(
    `Tokens — prompt: ${response.usage?.prompt_tokens}, completion: ${response.usage?.completion_tokens}, total: ${response.usage?.total_tokens}`,
  );

  const parsed = JSON.parse(raw) as GenerationResponse;
  return parsed;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateCards(result: GenerationResponse, chunkCount: number): void {
  const { cards } = result;
  const validTypes: CardType[] = ["insight", "quiz", "quote", "summary", "connection"];
  const errors: string[] = [];

  if (!Array.isArray(cards)) {
    console.error("FAIL: response.cards is not an array");
    return;
  }

  console.log(`\n--- Validation (${cards.length} cards) ---\n`);

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const prefix = `Card ${i} [${card.type}]`;

    // Type check
    if (!validTypes.includes(card.type)) {
      errors.push(`${prefix}: invalid type "${card.type}"`);
    }

    // Content check
    if (!card.content || card.content.length < 10) {
      errors.push(`${prefix}: content too short or missing`);
    }

    // Source indices check
    if (!Array.isArray(card.sourceChunkIndices) || card.sourceChunkIndices.length === 0) {
      errors.push(`${prefix}: sourceChunkIndices missing or empty`);
    } else {
      for (const idx of card.sourceChunkIndices) {
        if (idx < 0 || idx >= chunkCount) {
          errors.push(`${prefix}: sourceChunkIndices contains out-of-range index ${idx}`);
        }
      }
    }

    // Type-specific checks
    if (card.type === "quiz") {
      const quiz = card as QuizCard;
      if (!quiz.quizQuestion) errors.push(`${prefix}: missing quizQuestion`);
      if (!quiz.quizAnswer) errors.push(`${prefix}: missing quizAnswer`);
    }

    if (card.type === "summary" || card.type === "connection") {
      if (card.sourceChunkIndices.length < 2) {
        errors.push(
          `${prefix}: ${card.type} must reference 2+ chunks, got ${card.sourceChunkIndices.length}`,
        );
      }
    }
  }

  // Type distribution
  const typeCounts = new Map<string, number>();
  for (const card of cards) {
    typeCounts.set(card.type, (typeCounts.get(card.type) ?? 0) + 1);
  }

  console.log("Type distribution:");
  for (const [type, count] of typeCounts) {
    const pct = Math.round((count / cards.length) * 100);
    console.log(`  ${type}: ${count} (${pct}%)`);
  }

  const uniqueTypes = typeCounts.size;
  if (uniqueTypes < 2) {
    errors.push(`Only ${uniqueTypes} card type(s) produced — expected at least 2 different types`);
  }

  if (errors.length === 0) {
    console.log("\n✓ All validations passed");
  } else {
    console.log(`\n✗ ${errors.length} validation error(s):`);
    for (const err of errors) {
      console.log(`  - ${err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function displayCards(result: GenerationResponse, chunks: typeof SAMPLE_CHUNKS): void {
  console.log("\n--- Generated Cards ---\n");

  for (let i = 0; i < result.cards.length; i++) {
    const card = result.cards[i]!;
    const sources = card.sourceChunkIndices
      .map((idx) => `"${chunks[idx]?.documentTitle}" (chunk ${idx})`)
      .join(", ");

    console.log(`━━━ Card ${i + 1}: ${card.type.toUpperCase()} ━━━`);
    console.log(`Sources: ${sources}`);
    console.log();

    if (card.type === "quiz") {
      const quiz = card as QuizCard;
      console.log(`Context: ${quiz.content}`);
      console.log(`Q: ${quiz.quizQuestion}`);
      console.log(`A: ${quiz.quizAnswer}`);
    } else if (card.type === "quote") {
      const quote = card as QuoteCard;
      console.log(quote.content);
      if (quote.quoteAttribution) {
        console.log(`— ${quote.quoteAttribution}`);
      }
    } else {
      console.log(card.content);
    }

    console.log();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Multi-Type Card Generation Prototype ===");
  console.log(
    `Input: ${SAMPLE_CHUNKS.length} chunks from ${new Set(SAMPLE_CHUNKS.map((c) => c.documentTitle)).size} documents`,
  );

  const result = await generate(SAMPLE_CHUNKS);
  validateCards(result, SAMPLE_CHUNKS.length);
  displayCards(result, SAMPLE_CHUNKS);

  // Output raw JSON for inspection
  console.log("\n--- Raw JSON ---\n");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
