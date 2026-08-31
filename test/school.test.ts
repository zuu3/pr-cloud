import { describe, it, expect } from "vitest";
import { normalizeEmail } from "../src/lib/school";

describe("normalizeEmail", () => {
  it("appends the school domain to a bare local-part", () => {
    expect(normalizeEmail("24.036", "bssm.hs.kr")).toBe("24.036@bssm.hs.kr");
  });
  it("leaves a full address alone", () => {
    expect(normalizeEmail("a@b.com", "bssm.hs.kr")).toBe("a@b.com");
  });
  it("trims and lowercases", () => {
    expect(normalizeEmail("  24.001  ", "bssm.hs.kr")).toBe("24.001@bssm.hs.kr");
  });
});
