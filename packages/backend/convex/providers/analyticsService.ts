"use node";

import type { AnalyticsService, TokenUsage } from "./types";
import { captureEvent, captureAiUsage } from "./analytics";

export class PostHogAnalyticsService implements AnalyticsService {
  async captureEvent(opts: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }): Promise<void> {
    await captureEvent(opts);
  }

  async captureAiUsage(opts: {
    distinctId: string;
    operation: string;
    usage: TokenUsage;
    modelType: "llm" | "embedding";
    documentId?: string;
    model?: string;
  }): Promise<void> {
    await captureAiUsage(opts);
  }
}
