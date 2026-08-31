export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, init?: number | ResponseInit): Response {
  const opts = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(body), {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts as ResponseInit | undefined)?.headers,
    },
  });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("unhandled route error", e);
    return json({ error: "internal error" }, 500);
  }
}
