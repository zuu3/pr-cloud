// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SharePanel } from "@/components/share-panel";
import { ToastProvider } from "@/components/ui/toast";

function render(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return rtlRender(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("SharePanel", () => {
  it("creates a link and shows it in the list", async () => {
    let created = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === "POST") {
        created = true;
        return jsonRes({ token: "t".repeat(22), url: "https://x/s/" + "t".repeat(22) }, 201);
      }
      return jsonRes({
        links: created
          ? [
              {
                id: "s1",
                url: "https://x/s/" + "t".repeat(22),
                expiresAt: null,
                expired: false,
                createdAt: new Date().toISOString(),
              },
            ]
          : [],
      });
    });

    render(<SharePanel videoId="v1" />);
    fireEvent.click(screen.getByRole("button", { name: "공유 링크 만들기" }));
    await waitFor(() => expect(screen.getByLabelText("공유 링크")).toBeDefined());
    expect((screen.getByLabelText("공유 링크") as HTMLInputElement).value).toContain("/s/tttt");
  });

  it("shows a toast on create failure", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === "POST") {
        return jsonRes({ error: "not ready" }, 409);
      }
      return jsonRes({ links: [] });
    });
    render(<SharePanel videoId="v1" />);
    fireEvent.click(screen.getByRole("button", { name: "공유 링크 만들기" }));
    await waitFor(() => expect(screen.getByText("not ready")).toBeDefined());
  });
});
