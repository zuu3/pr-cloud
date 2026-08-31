import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("deploy artifacts", () => {
  it("next config is standalone", () => {
    expect(readFileSync("next.config.ts", "utf8")).toContain('output: "standalone"');
  });

  it("entrypoint migrates before starting the server", () => {
    const s = readFileSync("docker/entrypoint.sh", "utf8");
    expect(s.indexOf("migrate deploy")).toBeLessThan(s.indexOf("server.js"));
  });

  it("an init migration exists", () => {
    const sql = readFileSync("prisma/migrations/00000000000000_init/migration.sql", "utf8");
    expect(sql).toContain("CREATE TABLE");
  });
});
