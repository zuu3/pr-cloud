import { describe, it, expect } from "vitest";
import { humanSize, humanDuration } from "../src/lib/format";

describe("humanSize", () => {
  it("formats", () => {
    expect(humanSize(null)).toBe("—");
    expect(humanSize(0)).toBe("0 B");
    expect(humanSize(1536)).toBe("1.5 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(humanSize(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});

describe("humanDuration", () => {
  it("formats m:ss, empty for null/zero", () => {
    expect(humanDuration(null)).toBe("");
    expect(humanDuration(0)).toBe("");
    expect(humanDuration(9)).toBe("0:09");
    expect(humanDuration(75)).toBe("1:15");
    expect(humanDuration(3661)).toBe("61:01");
  });
});
