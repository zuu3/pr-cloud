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
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
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

describe("SharePanel", () => {
  it("creates a link and shows it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "t".repeat(22),
          url: "https://promo.madp.cloud/s/" + "t".repeat(22),
        }),
        { status: 201 },
      ),
    );
    render(<SharePanel videoId="v1" />);
    fireEvent.click(screen.getByRole("button", { name: "공유 링크 만들기" }));
    await waitFor(() => expect(screen.getByLabelText("공유 링크")).toBeDefined());
    expect((screen.getByLabelText("공유 링크") as HTMLInputElement).value).toContain("/s/tttt");
  });

  it("shows a toast on failure (no link rendered)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "not ready" }), { status: 409 }),
    );
    render(<SharePanel videoId="v1" />);
    fireEvent.click(screen.getByRole("button", { name: "공유 링크 만들기" }));
    await waitFor(() => expect(screen.getByText("not ready")).toBeDefined());
    expect(screen.queryByLabelText("공유 링크")).toBeNull();
  });
});
