import { defineConfig } from "@playwright/test";

// Requires a running stack. Locally:
//   docker compose -f docker-compose.dev.yml up -d
//   DATABASE_URL=... npx prisma migrate deploy && npm run setup:bucket
//   E2E_AUTH=1 npm run build && E2E_AUTH=1 npm start
// CI wires the same via services (see .github/workflows/ci.yml).
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "E2E_AUTH=1 npm start",
        url: "http://localhost:3000/api/healthz",
        timeout: 120_000,
        reuseExistingServer: true,
      },
});
