#!/bin/sh
set -e

cd "$(dirname "$0")/../packages/backend"

if [ -n "$CONVEX_PREVIEW_NAME" ]; then
  npx convex deploy --preview-create "$CONVEX_PREVIEW_NAME" --cmd 'cd ../../apps/web && bun run build' --preview-run 'migrations:runAll'
elif [ "$VERCEL_GIT_COMMIT_REF" = "main" ] || [ "$VERCEL_GIT_COMMIT_REF" = "dev" ]; then
  npx convex deploy --cmd 'npx convex run migrations:runAll && cd ../../apps/web && bun run build'
else
  npx convex deploy --cmd 'cd ../../apps/web && bun run build' --preview-run 'migrations:runAll'
fi
