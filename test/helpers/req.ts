import { vi } from "vitest";
import { HttpError } from "@/lib/http";

type MockUser = { email: string; role: "member" | "admin" } | null;

/**
 * Mock the auth guards for a route test. Call before `await import(route)`.
 * Routes import from "@/lib/auth", so that's the key we intercept.
 */
export function mockSession(user: MockUser) {
  vi.doMock("@/lib/auth", () => ({
    requireUser: async () => {
      if (!user) throw new HttpError(401, "login required");
      return { ...user, name: null };
    },
    requireAdmin: async () => {
      if (!user) throw new HttpError(401, "login required");
      if (user.role !== "admin") throw new HttpError(403, "admin only");
      return { ...user, name: null };
    },
    auth: async () => (user ? { user: { ...user, name: null } } : null),
  }));
}

export function req(url: string, init?: RequestInit) {
  return new Request(`http://test${url}`, init);
}

export function jbody(o: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(o),
  };
}
