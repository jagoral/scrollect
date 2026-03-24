import { config } from "dotenv";
import { defineConfig } from "evalite/config";

config({ path: ".env.local" });

export default defineConfig({
  testTimeout: 120_000,
  maxConcurrency: 5,
  trialCount: 1,
  cache: true,
  scoreThreshold: 80,
  forceRerunTriggers: [
    "convex/providers/cardDraftLlm.ts",
    "convex/providers/highlightDraftLlm.ts",
    "convex/providers/thematicLlm.ts",
    "convex/providers/connectionDiscoveryLlm.ts",
  ],
  server: { port: 3006 },
});
