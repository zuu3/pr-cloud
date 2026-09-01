#!/bin/sh
# Manual launcher for debugging (promo.service calls node directly).
# migrate, then run the Next standalone server.
set -e
cd "$(dirname "$0")"

echo "running migrations..."
node prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma

echo "starting server on :${PORT:-8080}"
exec node server.js
