import { groupBy } from "es-toolkit";

import { HOOK_CARD_TYPES, MAX_CONSECUTIVE_SAME_TYPE } from "./constants";

type InterleaveArgs<T> = {
  cards: T[];
  getType: (card: T) => string;
  maxConsecutive?: number;
};

export function interleaveCards<T>(args: InterleaveArgs<T>): T[] {
  const { cards, getType, maxConsecutive = MAX_CONSECUTIVE_SAME_TYPE } = args;

  if (cards.length <= 1) return [...cards];

  const buckets = buildTypeBuckets(cards, getType);
  const result: T[] = [];
  let remaining = cards.length;

  const hook = pickHookCard(buckets);
  if (hook) {
    result.push(hook);
    remaining--;
  }

  let previousType = result.length > 0 ? getType(result[0]!) : "";
  let consecutiveCount = result.length > 0 ? 1 : 0;

  while (remaining > 0) {
    const mustSwitch = consecutiveCount >= maxConsecutive;
    const next = pickNextCard({ buckets, previousType, mustSwitch });
    if (!next) break;
    result.push(next.card);
    remaining--;

    if (next.type === previousType) {
      consecutiveCount++;
    } else {
      consecutiveCount = 1;
      previousType = next.type;
    }
  }

  return result;
}

function buildTypeBuckets<T>(cards: T[], getType: (card: T) => string): Map<string, T[]> {
  return new Map(Object.entries(groupBy(cards, getType)));
}

function pickHookCard<T>(buckets: Map<string, T[]>): T | null {
  for (const hookType of HOOK_CARD_TYPES) {
    const bucket = buckets.get(hookType);
    if (bucket && bucket.length > 0) {
      return bucket.shift()!;
    }
  }
  return null;
}

type PickNextArgs<T> = {
  buckets: Map<string, T[]>;
  previousType: string;
  mustSwitch: boolean;
};

function pickNextCard<T>(args: PickNextArgs<T>): { card: T; type: string } | null {
  const { buckets, previousType, mustSwitch } = args;

  let bestType: string | null = null;
  let bestSize = -1;

  for (const [type, bucket] of buckets) {
    if (bucket.length === 0) continue;
    if (mustSwitch && type === previousType) continue;
    if (bucket.length > bestSize) {
      bestType = type;
      bestSize = bucket.length;
    }
  }

  if (!bestType) {
    for (const [type, bucket] of buckets) {
      if (bucket.length > 0) {
        bestType = type;
        break;
      }
    }
  }

  if (!bestType) return null;

  const card = buckets.get(bestType)!.shift()!;
  return { card, type: bestType };
}
