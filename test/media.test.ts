import { describe, it, expect } from "vitest";
import { isWebPlayable } from "@/lib/media";

describe("isWebPlayable", () => {
  it("h264 in an mp4/mov container is playable", () => {
    expect(isWebPlayable("h264", "mp4")).toBe(true);
    expect(isWebPlayable("h264", "MOV")).toBe(true);
    expect(isWebPlayable("vp9", "webm")).toBe(true);
  });

  it("camera codecs are not playable", () => {
    expect(isWebPlayable("hevc", "mov")).toBe(false);
    expect(isWebPlayable("prores", "mov")).toBe(false);
    expect(isWebPlayable("mpeg4", "avi")).toBe(false);
  });

  it("h264 in a non-web container is not playable", () => {
    expect(isWebPlayable("h264", "mkv")).toBe(false);
    expect(isWebPlayable("h264", "ts")).toBe(false);
  });

  it("unknown codec stays unknown", () => {
    expect(isWebPlayable(null, "mp4")).toBeNull();
  });
});
