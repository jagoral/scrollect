import { describe, expect, test } from "vitest";

import { interleaveCards } from "../interleaving";
import { MAX_CONSECUTIVE_SAME_TYPE } from "../constants";

type TestCard = { id: string; type: string };

const card = (id: string, type: string): TestCard => ({ id, type });
const getType = (c: TestCard) => c.type;

function hasNoConsecutiveDuplicates(cards: TestCard[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    if (cards[i]!.type === cards[i - 1]!.type) return false;
  }
  return true;
}

function maxConsecutiveRun(cards: TestCard[]): number {
  if (cards.length === 0) return 0;
  let max = 1;
  let current = 1;
  for (let i = 1; i < cards.length; i++) {
    if (cards[i]!.type === cards[i - 1]!.type) {
      current++;
      max = Math.max(max, current);
    } else {
      current = 1;
    }
  }
  return max;
}

describe("interleaveCards", () => {
  test("returns empty array for empty input", () => {
    const result = interleaveCards({ cards: [], getType });
    expect(result).toEqual([]);
  });

  test("returns single card unchanged", () => {
    const cards = [card("1", "insight")];
    const result = interleaveCards({ cards, getType });
    expect(result).toEqual(cards);
  });

  test("returns all cards when all are the same type (fallback)", () => {
    const cards = [card("1", "insight"), card("2", "insight"), card("3", "insight")];
    const result = interleaveCards({ cards, getType });
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.type)).toEqual(["insight", "insight", "insight"]);
  });

  test("places quiz as hook card when available", () => {
    const cards = [
      card("1", "insight"),
      card("2", "quote"),
      card("3", "quiz"),
      card("4", "summary"),
    ];
    const result = interleaveCards({ cards, getType });
    expect(result[0]!.type).toBe("quiz");
  });

  test("places connection as hook card when no quiz available", () => {
    const cards = [
      card("1", "insight"),
      card("2", "quote"),
      card("3", "connection"),
      card("4", "summary"),
    ];
    const result = interleaveCards({ cards, getType });
    expect(result[0]!.type).toBe("connection");
  });

  test("prefers quiz over connection as hook card", () => {
    const cards = [card("1", "connection"), card("2", "quiz"), card("3", "insight")];
    const result = interleaveCards({ cards, getType });
    expect(result[0]!.type).toBe("quiz");
  });

  test("picks from largest bucket first when no hook types exist", () => {
    const cards = [
      card("1", "insight"),
      card("2", "insight"),
      card("3", "quote"),
      card("4", "summary"),
    ];
    const result = interleaveCards({ cards, getType });
    expect(result).toHaveLength(4);
    expect(result[0]!.type).toBe("insight");
  });

  test("maxConsecutive=1 enforces no consecutive duplicates with mixed types", () => {
    const cards = [
      card("1", "insight"),
      card("2", "insight"),
      card("3", "quiz"),
      card("4", "quiz"),
      card("5", "quote"),
      card("6", "quote"),
    ];
    const result = interleaveCards({ cards, getType, maxConsecutive: 1 });
    expect(result).toHaveLength(6);
    expect(hasNoConsecutiveDuplicates(result)).toBe(true);
  });

  test("maxConsecutive=1 enforces no consecutive duplicates with two types", () => {
    const cards = [
      card("1", "insight"),
      card("2", "insight"),
      card("3", "quiz"),
      card("4", "quiz"),
    ];
    const result = interleaveCards({ cards, getType, maxConsecutive: 1 });
    expect(result).toHaveLength(4);
    expect(hasNoConsecutiveDuplicates(result)).toBe(true);
  });

  test("handles uneven distribution: consecutive only when no alternative", () => {
    const cards = [
      card("1", "insight"),
      card("2", "insight"),
      card("3", "insight"),
      card("4", "insight"),
      card("5", "quiz"),
    ];
    const result = interleaveCards({ cards, getType, maxConsecutive: 1 });
    expect(result).toHaveLength(5);
    expect(result[0]!.type).toBe("quiz");
    expect(result.map((c) => c.type)).toEqual(["quiz", "insight", "insight", "insight", "insight"]);
  });

  test("preserves all cards - never drops content", () => {
    const cards = [
      card("1", "insight"),
      card("2", "quiz"),
      card("3", "quote"),
      card("4", "summary"),
      card("5", "connection"),
    ];
    const result = interleaveCards({ cards, getType });
    expect(result).toHaveLength(5);
    const ids = new Set(result.map((c) => c.id));
    expect(ids.size).toBe(5);
  });

  test("all five types interleaved correctly with maxConsecutive=1", () => {
    const cards = [
      card("1", "insight"),
      card("2", "quiz"),
      card("3", "quote"),
      card("4", "summary"),
      card("5", "connection"),
      card("6", "insight"),
      card("7", "quiz"),
      card("8", "quote"),
      card("9", "summary"),
      card("10", "connection"),
    ];
    const result = interleaveCards({ cards, getType, maxConsecutive: 1 });
    expect(result).toHaveLength(10);
    expect(hasNoConsecutiveDuplicates(result)).toBe(true);
    expect(["quiz", "connection"]).toContain(result[0]!.type);
  });

  test("default maxConsecutive respects constant", () => {
    const cards = [
      ...Array.from({ length: 6 }, (_, i) => card(`i${i}`, "insight")),
      ...Array.from({ length: 6 }, (_, i) => card(`q${i}`, "quiz")),
    ];
    const result = interleaveCards({ cards, getType });
    expect(result).toHaveLength(12);
    expect(result[0]!.type).toBe("quiz");
    expect(maxConsecutiveRun(result)).toBeLessThanOrEqual(MAX_CONSECUTIVE_SAME_TYPE);
  });

  test("does not mutate input array", () => {
    const cards = [card("1", "insight"), card("2", "quiz"), card("3", "quote")];
    const original = [...cards];
    interleaveCards({ cards, getType });
    expect(cards).toEqual(original);
  });

  test("maxConsecutive=2 allows up to 2 consecutive same-type cards", () => {
    const cards = [
      card("1", "insight"),
      card("2", "insight"),
      card("3", "insight"),
      card("4", "insight"),
      card("5", "quiz"),
      card("6", "quiz"),
    ];
    const result = interleaveCards({ cards, getType, maxConsecutive: 2 });
    expect(result).toHaveLength(6);
    expect(maxConsecutiveRun(result)).toBeLessThanOrEqual(2);
  });

  test("maxConsecutive=2 still preserves all cards", () => {
    const cards = [
      card("1", "insight"),
      card("2", "insight"),
      card("3", "insight"),
      card("4", "quiz"),
    ];
    const result = interleaveCards({ cards, getType, maxConsecutive: 2 });
    expect(result).toHaveLength(4);
    const ids = new Set(result.map((c) => c.id));
    expect(ids.size).toBe(4);
  });

  test("maxConsecutive=3 allows longer runs before switching", () => {
    const cards = [
      ...Array.from({ length: 6 }, (_, i) => card(`i${i}`, "insight")),
      ...Array.from({ length: 3 }, (_, i) => card(`q${i}`, "quiz")),
    ];
    const result = interleaveCards({ cards, getType, maxConsecutive: 3 });
    expect(result).toHaveLength(9);
    expect(maxConsecutiveRun(result)).toBeLessThanOrEqual(3);
  });

  test("maxConsecutive fallback: all same type still returned with any limit", () => {
    const cards = [card("1", "insight"), card("2", "insight"), card("3", "insight")];
    const result = interleaveCards({ cards, getType, maxConsecutive: 2 });
    expect(result).toHaveLength(3);
  });
});
