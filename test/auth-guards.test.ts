import { describe, it, expect, vi } from "vitest";

// env comes from test/setup.ts

function loadWithSession(session: unknown) {
  vi.resetModules();
  vi.doMock("next-auth", () => ({
    default: () => ({
      handlers: { GET: vi.fn(), POST: vi.fn() },
      auth: async () => session,
      signIn: vi.fn(),
      signOut: vi.fn(),
    }),
  }));
  vi.doMock("next-auth/providers/google", () => ({ default: () => ({}) }));
  return import("../src/lib/auth");
}

describe("requireUser / requireAdmin", () => {
  it("401 when no session", async () => {
    const { requireUser } = await loadWithSession(null);
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  });

  it("403 for member on requireAdmin", async () => {
    const { requireAdmin } = await loadWithSession({ user: { email: "m@x", role: "member" } });
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });

  it("passes admin through", async () => {
    const { requireAdmin } = await loadWithSession({ user: { email: "a@x", role: "admin" } });
    await expect(requireAdmin()).resolves.toMatchObject({ email: "a@x", role: "admin" });
  });
});
