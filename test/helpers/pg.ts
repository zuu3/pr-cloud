import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { PrismaClient } from "@prisma/client";

// Real Postgres, no Docker. First run downloads a ~30MB binary and caches it.
let portSeq = 55_000 + Math.floor(Math.random() * 4_000);

export async function startTestDb() {
  const dataDir = mkdtempSync(join(tmpdir(), "promo-pg-"));
  const port = portSeq++;
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: "promo",
    password: "promo",
    authMethod: "password",
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("promovideo");
  const url = `postgresql://promo:promo@localhost:${port}/promovideo`;

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  return {
    prisma,
    url,
    stop: async () => {
      await prisma.$disconnect();
      await pg.stop();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
