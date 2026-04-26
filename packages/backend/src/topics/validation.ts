/**
 * Pure validation and sanitization helpers for topic input + ownership policy.
 *
 * Lives in `src/` so it has zero Convex runtime dependency and is unit-testable.
 * The Convex edge in `convex/topics/topics.ts` calls these to enforce the same rules
 * a controller-side Convex mutation would; ownership errors are raised by `assertOwnedTopic`
 * but the caller is responsible for translating them into a `ConvexError` (the helper
 * cannot construct one without the Convex runtime).
 */

export const NAME_MAX_LENGTH = 80;
export const LEARNING_GOAL_MAX_LENGTH = 500;
export const DESCRIPTION_MAX_LENGTH = 1000;
export const APPEARANCE_MAX_LENGTH = 32;

export type OwnedTopic = { _id: string; userId: string };

export class TopicValidationError extends Error {
  readonly code:
    | "topic_name_empty"
    | "topic_name_too_long"
    | "learning_goal_empty"
    | "learning_goal_too_long"
    | "description_too_long"
    | "appearance_too_long"
    | "topic_not_found";

  constructor(code: TopicValidationError["code"], message: string) {
    super(message);
    this.name = "TopicValidationError";
    this.code = code;
  }
}

export function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new TopicValidationError("topic_name_empty", "Topic name cannot be empty");
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    throw new TopicValidationError(
      "topic_name_too_long",
      `Topic name must be at most ${NAME_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

export function validateLearningGoal(goal: string): string {
  const trimmed = goal.trim();
  if (trimmed.length === 0) {
    throw new TopicValidationError("learning_goal_empty", "Learning goal cannot be empty");
  }
  if (trimmed.length > LEARNING_GOAL_MAX_LENGTH) {
    throw new TopicValidationError(
      "learning_goal_too_long",
      `Learning goal must be at most ${LEARNING_GOAL_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

export function sanitizeDescription(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  const trimmed = description.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
    throw new TopicValidationError(
      "description_too_long",
      `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

export function sanitizeAppearance(
  value: string | undefined,
  field: "color" | "icon",
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > APPEARANCE_MAX_LENGTH) {
    throw new TopicValidationError(
      "appearance_too_long",
      `Topic ${field} must be at most ${APPEARANCE_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

/**
 * Ownership gate. Throws `TopicValidationError("topic_not_found")` if the topic is
 * absent or owned by another user. Convex callers should catch and re-raise as
 * `ConvexError({ code: "topic_not_found" })` so the error code reaches the client.
 */
export function assertOwnedTopic(
  topic: OwnedTopic | null | undefined,
  userId: string,
): asserts topic is OwnedTopic {
  if (!topic || topic.userId !== userId) {
    throw new TopicValidationError("topic_not_found", "Topic not found");
  }
}
