export class HttpError extends Error {
  readonly isHttpError = true;
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Duck-typed check — survives module-identity splits (e.g. vitest resetModules). */
export function isHttpError(e: unknown): e is HttpError {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { isHttpError?: unknown }).isHttpError === true &&
    typeof (e as { status?: unknown }).status === "number"
  );
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
    if (isHttpError(e)) return json({ error: e.message }, e.status);
    console.error(
      JSON.stringify({
        at: new Date().toISOString(),
        level: "error",
        msg: "unhandled route error",
        err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : String(e),
      }),
    );
    return json({ error: "internal error" }, 500);
  }
}
