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
    "src/providers/cardDraftLlm.ts",
    "src/providers/sectionDraftRankerLlm.ts",
    "src/pipeline/logic/draftGenerationPlan.ts",
    "src/providers/highlightDraftLlm.ts",
    "src/providers/thematicLlm.ts",
    "src/providers/connectionDiscoveryLlm.ts",
  ],
  server: { port: 3006 },
});
