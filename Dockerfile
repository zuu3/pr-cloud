FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder env so `next build` can evaluate config; real values injected at runtime.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    NEXTAUTH_SECRET=build NEXTAUTH_URL=http://localhost:3000 \
    GOOGLE_CLIENT_ID=build GOOGLE_CLIENT_SECRET=build GOOGLE_HD=example.com \
    S3_ENDPOINT_EXTERNAL=http://localhost:9000 S3_ENDPOINT_INTERNAL=http://localhost:9000 \
    S3_REGION=us-east-1 S3_BUCKET=build S3_ACCESS_KEY=build S3_SECRET_KEY=build \
    SEED_ADMIN_EMAIL=build@example.com \
    NEXT_PUBLIC_SINGLE_PUT_MAX_BYTES=83886080
RUN npm run build

# prisma CLI (+ its full dep closure: @prisma/config, effect, @prisma/engines …)
# installed standalone so `migrate deploy` works without dragging the whole
# build node_modules into the runtime image.
FROM node:20-slim AS prisma-cli
WORKDIR /pc
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm init -y >/dev/null 2>&1 && npm i --omit=dev --no-audit --no-fund prisma@6.19.3

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# ffmpeg/ffprobe: thumbnail + duration extraction on upload complete (src/lib/media.ts)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
# generated @prisma/client engine for the app server (debian-openssl-3.0.x)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
# prisma CLI + deps for the migration step (separate tree at /prisma-cli)
COPY --from=prisma-cli /pc/node_modules /prisma-cli/node_modules
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 3000
CMD ["./entrypoint.sh"]
