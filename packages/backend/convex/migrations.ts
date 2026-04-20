import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { action } from "./_generated/server";

export const migrations = new Migrations<DataModel>(components.migrations);

/**
 * Generic runner for schema-table migrations defined with `migrations.define()`.
 * Usage: `npx convex run migrations:run '{"fn": "migrations:<name>"}'`.
 */
export const run = migrations.runner();

/**
 * Public entrypoint for deploy-time migrations, invoked by `scripts/vercel-build.sh`
 * via `npx convex run migrations:runAll`. Must be a public `action` so the CLI
 * can call it; Convex's CLI cannot invoke `internalAction`s.
 *
 * Add new migrations here in execution order. Each step must be idempotent:
 * the `@convex-dev/migrations` component automatically skips completed table
 * migrations, and one-off actions are responsible for their own idempotency.
 * If a step fails the deploy aborts - re-running resumes from where it left off.
 */
export const runAll = action({
  args: {},
  handler: async (_ctx) => {
    // Schema-table migrations defined with `migrations.define()` go here, e.g.:
    //   await migrations.runOne(ctx, internal.migrations.<name>);
  },
});
