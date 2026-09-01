#!/bin/sh
set -e
echo "running migrations..."
# prisma CLI lives in its own tree (/prisma-cli/node_modules); point it at the
# app schema. Migrate engine is bundled with the CLI — no generated client needed.
node /prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma
echo "starting server..."
exec node server.js
