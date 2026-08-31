#!/bin/sh
set -e
echo "running migrations..."
node node_modules/prisma/build/index.js migrate deploy
echo "starting server..."
exec node server.js
