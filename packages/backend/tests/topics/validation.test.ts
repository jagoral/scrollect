import { describe, expect, it } from "vitest";

import {
  APPEARANCE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  LEARNING_GOAL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  TopicValidationError,
  assertOwnedTopic,
  sanitizeAppearance,
  sanitizeDescription,
  validateLearningGoal,
  validateName,
} from "../../src/topics/validation";

describe("validateName", () => {
  it("trims and returns valid name", () => {
    expect(validateName("  Productivity  ")).toBe("Productivity");
  });

  it("throws on empty/whitespace name", () => {
    expect(() => validateName("   ")).toThrow(TopicValidationError);
    try {
      validateName("");
    } catch (e) {
      expect((e as TopicValidationError).code).toBe("topic_name_empty");
    }
  });

  it("throws when name exceeds max length", () => {
    const tooLong = "x".repeat(NAME_MAX_LENGTH + 1);
    try {
      validateName(tooLong);
    } catch (e) {
      expect((e as TopicValidationError).code).toBe("topic_name_too_long");
    }
  });

  it("accepts exactly max length", () => {
    const atMax = "x".repeat(NAME_MAX_LENGTH);
    expect(validateName(atMax)).toBe(atMax);
  });
});

describe("validateLearningGoal", () => {
  it("trims and returns goal", () => {
    expect(validateLearningGoal("  Learn DDD  ")).toBe("Learn DDD");
  });

  it("throws on empty goal", () => {
    try {
      validateLearningGoal(" ");
    } catch (e) {
      expect((e as TopicValidationError).code).toBe("learning_goal_empty");
    }
  });

  it("throws on too-long goal", () => {
    try {
      validateLearningGoal("y".repeat(LEARNING_GOAL_MAX_LENGTH + 1));
    } catch (e) {
      expect((e as TopicValidationError).code).toBe("learning_goal_too_long");
    }
  });
});

describe("sanitizeDescription", () => {
  it("returns undefined when input is undefined", () => {
    expect(sanitizeDescription(undefined)).toBeUndefined();
  });

  it("returns undefined when input is empty/whitespace", () => {
    expect(sanitizeDescription("")).toBeUndefined();
    expect(sanitizeDescription("   ")).toBeUndefined();
  });

  it("trims valid description", () => {
    expect(sanitizeDescription("  hi  ")).toBe("hi");
  });

  it("throws when description exceeds max length", () => {
    try {
      sanitizeDescription("z".repeat(DESCRIPTION_MAX_LENGTH + 1));
    } catch (e) {
      expect((e as TopicValidationError).code).toBe("description_too_long");
    }
  });
});

describe("sanitizeAppearance", () => {
  it("returns undefined for empty inputs", () => {
    expect(sanitizeAppearance(undefined, "color")).toBeUndefined();
    expect(sanitizeAppearance("   ", "color")).toBeUndefined();
  });

  it("trims valid color/icon", () => {
    expect(sanitizeAppearance("  #fff  ", "color")).toBe("#fff");
    expect(sanitizeAppearance("  star  ", "icon")).toBe("star");
  });

  it("throws when value exceeds max length", () => {
    const tooLong = "a".repeat(APPEARANCE_MAX_LENGTH + 1);
    try {
      sanitizeAppearance(tooLong, "color");
    } catch (e) {
      expect((e as TopicValidationError).code).toBe("appearance_too_long");
    }
  });
});

describe("assertOwnedTopic", () => {
  it("passes for owned topic", () => {
    const topic = { _id: "t1", userId: "u1" };
    expect(() => assertOwnedTopic(topic, "u1")).not.toThrow();
  });

  it("throws topic_not_found when topic is null/undefined", () => {
    try {
      assertOwnedTopic(null, "u1");
    } catch (e) {
      expect((e as TopicValidationError).code).toBe("topic_not_found");
    }
    try {
      assertOwnedTopic(undefined, "u1");
    } catch (e) {
      expect((e as TopicValidationError).code).toBe("topic_not_found");
    }
  });

  it("throws topic_not_found when owned by another user", () => {
    try {
      assertOwnedTopic({ _id: "t1", userId: "other" }, "u1");
    } catch (e) {
      expect((e as TopicValidationError).code).toBe("topic_not_found");
    }
  });
});
