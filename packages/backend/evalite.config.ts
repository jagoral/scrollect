import { config } from "dotenv";
import { defineConfig } from "evalite/config";
import { createSqliteStorage } from "evalite/sqlite-storage";

config({ path: ".env.local" });

export default defineConfig({
  storage: () => createSqliteStorage("evals/.results/evalite.db"),
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
