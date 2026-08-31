import { describe, it, expect } from "vitest";
import { HttpError, json, handle } from "../src/lib/http";

describe("http", () => {
  it("json sets status from number init", async () => {
    const r = json({ ok: true }, 201);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("handle maps HttpError to status + {error}", async () => {
    const r = await handle(async () => {
      throw new HttpError(403, "nope");
    });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "nope" });
  });

  it("handle maps unknown error to 500", async () => {
    const r = await handle(async () => {
      throw new Error("boom");
    });
    expect(r.status).toBe(500);
  });
});
