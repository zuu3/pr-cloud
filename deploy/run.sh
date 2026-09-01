#!/bin/sh
# Bare-metal launcher: migrate, then run the Next standalone server.
# Used by promo.service (ExecStart) and can be run by hand for debugging.
set -e
cd "$(dirname "$0")"

echo "running migrations..."
node prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma

echo "starting server on :${PORT:-8080}"
exec node server.js
