import { describe, it, expect } from "vitest";
import { allow, assertRate } from "@/lib/ratelimit";

describe("rate limit", () => {
  it("allows up to the limit then blocks within the window", () => {
    const key = `t-${Math.random()}`;
    expect(allow(key, 3, 10_000)).toBe(true);
    expect(allow(key, 3, 10_000)).toBe(true);
    expect(allow(key, 3, 10_000)).toBe(true);
    expect(allow(key, 3, 10_000)).toBe(false);
  });

  it("assertRate throws HttpError 429 past the limit", () => {
    const key = `t-${Math.random()}`;
    assertRate(key, 1, 10_000);
    expect(() => assertRate(key, 1, 10_000)).toThrowError(
      expect.objectContaining({ status: 429 }),
    );
  });

  it("separate keys have separate budgets", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(allow(a, 1, 10_000)).toBe(true);
    expect(allow(a, 1, 10_000)).toBe(false);
    expect(allow(b, 1, 10_000)).toBe(true);
  });
});
