// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

import { Nav } from "@/components/nav";

afterEach(cleanup);

describe("Nav", () => {
  it("hides admin link for members", () => {
    render(<Nav user={{ email: "m@school.ac.kr", role: "member" }} />);
    expect(screen.queryByRole("link", { name: "계정관리" })).toBeNull();
  });

  it("shows admin link for admins", () => {
    render(<Nav user={{ email: "a@school.ac.kr", role: "admin" }} />);
    expect(screen.getByRole("link", { name: "계정관리" })).toBeDefined();
  });
});
