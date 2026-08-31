// Local preview infra without Docker: embedded-postgres + in-process S3 stub.
// Keeps running until killed. Run `next dev` alongside with the matching .env.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { startS3 } from "../test/helpers/s3-stub";

const DATA_DIR = join(process.cwd(), ".dev-pg");
const PG_PORT = 5432;
const S3_PORT = 9000;
const DB_URL = `postgresql://promo:promo@localhost:${PG_PORT}/promovideo`;

mkdirSync(DATA_DIR, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  port: PG_PORT,
  user: "promo",
  password: "promo",
  authMethod: "password",
  persistent: true,
  onLog: () => {},
  onError: () => {},
});

try {
  await pg.initialise();
} catch {
  // already initialised
}
await pg.start();
try {
  await pg.createDatabase("promovideo");
} catch {
  // already exists
}

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: DB_URL },
  stdio: "inherit",
});

const s3 = await startS3("promo-video", S3_PORT);

// seed the admin so E2E_AUTH login works immediately
execFileSync(
  "node",
  [
    "-e",
    `const {PrismaClient}=require("@prisma/client");const p=new PrismaClient({datasources:{db:{url:"${DB_URL}"}}});p.user.upsert({where:{email:process.env.SEED_ADMIN_EMAIL||"admin@bssm.hs.kr"},update:{status:"active"},create:{email:process.env.SEED_ADMIN_EMAIL||"admin@bssm.hs.kr",role:"admin",status:"active"}}).then(()=>p.$disconnect());`,
  ],
  { stdio: "inherit", env: process.env },
);

console.log("\n─────────────────────────────────────────────");
console.log(` Postgres : ${DB_URL}`);
console.log(` S3 stub  : ${s3.endpoint}  (bucket promo-video)`);
console.log(" Next     : run  E2E_AUTH=1 npm run dev");
console.log(" Login    : http://localhost:3000/api/auth/signin  (any seeded email)");
console.log("─────────────────────────────────────────────\n");

process.on("SIGINT", async () => {
  await s3.stop();
  await pg.stop();
  process.exit(0);
});

// keep alive
setInterval(() => {}, 1 << 30);
