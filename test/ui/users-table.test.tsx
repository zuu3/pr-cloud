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
import { ToastProvider } from "@/components/ui/toast";
import { DialogProvider } from "@/components/ui/dialog";
import { UsersTable } from "@/app/(app)/admin/users-table";

function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return rtlRender(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DialogProvider>{ui}</DialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UsersTable", () => {
  it("adds an email via POST and appends a row", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { email: "x@school.ac.kr", role: "member", status: "invited", name: null },
        }),
        { status: 201 },
      ),
    );
    render(<UsersTable initial={[]} />);
    fireEvent.change(screen.getByLabelText(/이메일/), { target: { value: "x@school.ac.kr" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() => expect(screen.getByText("x@school.ac.kr")).toBeDefined());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows inline error on 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "already exists" }), { status: 409 }),
    );
    render(<UsersTable initial={[]} />);
    fireEvent.change(screen.getByLabelText(/이메일/), { target: { value: "dup@school.ac.kr" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeDefined());
  });
});
