// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { UsersTable } from "@/app/(app)/admin/users-table";

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
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "x@school.ac.kr" },
    });
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
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "dup@school.ac.kr" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeDefined());
  });
});
