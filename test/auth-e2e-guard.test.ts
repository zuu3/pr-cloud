import { describe, it, expect, vi } from "vitest";

async function load() {
  vi.resetModules();
  vi.doMock("next-auth", () => ({ default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }) }));
  vi.doMock("next-auth/providers/google", () => ({ default: () => ({}) }));
  vi.doMock("next-auth/providers/credentials", () => ({ default: () => ({}) }));
  return import("../src/lib/auth");
}

describe("e2e auth provider guard", () => {
  it("disabled when E2E_AUTH unset", async () => {
    delete process.env.E2E_AUTH;
    const mod = await load();
    expect(mod.isE2EAuthEnabled()).toBe(false);
  });

  it("enabled when E2E_AUTH=1", async () => {
    process.env.E2E_AUTH = "1";
    const mod = await load();
    expect(mod.isE2EAuthEnabled()).toBe(true);
    delete process.env.E2E_AUTH;
  });
});
