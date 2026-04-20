#!/bin/sh
set -e

if [ "$SKIP_CONVEX_DEPLOY" = "1" ]; then
  cd "$(dirname "$0")/../apps/web"
  bun run build
  exit 0
fi

cd "$(dirname "$0")/../packages/backend"

if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then
  npx convex deploy
  npx convex run migrations:runAll
  cd ../../apps/web
  bun run build
else
  npx convex deploy --cmd 'cd ../../apps/web && bun run build' --preview-run 'migrations:runAll'
fi
