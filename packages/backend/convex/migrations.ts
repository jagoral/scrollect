import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

export const migrations = new Migrations<DataModel>(components.migrations);

// Add migrations here as they are defined, then pass them to the runner:
// export const runAll = migrations.runner([
//   internal.migrations.myFirstMigration,
// ]);
