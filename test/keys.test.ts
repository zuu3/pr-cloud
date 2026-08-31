import { describe, it, expect } from "vitest";
import { makeVideoKey } from "../src/lib/keys";

describe("makeVideoKey", () => {
  const yr = new Date().getFullYear();

  it("builds promo-video/<year>/<uuid>.<ext>", () => {
    const k = makeVideoKey("MP4");
    expect(k).toMatch(new RegExp(`^promo-video/${yr}/[0-9a-f-]{36}\\.mp4$`));
  });

  it("strips leading dot", () => {
    expect(makeVideoKey(".mov")).toMatch(/\.mov$/);
  });

  it("falls back to bin for empty/garbage ext", () => {
    expect(makeVideoKey("")).toMatch(/\.bin$/);
    expect(makeVideoKey("!!")).toMatch(/\.bin$/);
  });
});
