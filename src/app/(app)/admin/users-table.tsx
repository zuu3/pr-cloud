"use client";

import { useState } from "react";
import { SCHOOL_DOMAIN, normalizeEmail } from "@/lib/school";

type Row = {
  email: string;
  role: "member" | "admin";
  status: string;
  name: string | null;
};

export function UsersTable({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setErr(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: normalizeEmail(email) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data.error ?? "추가하지 못했어요");
    setRows((r) => [...r, data.user]);
    setEmail("");
  }

  async function setRole(t: Row, role: "member" | "admin") {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(t.email)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setRows((r) => r.map((x) => (x.email === t.email ? { ...x, role } : x)));
    } else {
      setErr((await res.json().catch(() => ({}))).error ?? "변경하지 못했어요");
    }
  }

  async function remove(t: Row) {
    if (!confirm(`${t.email} 계정을 삭제할까요?`)) return;
    const res = await fetch(`/api/admin/users/${encodeURIComponent(t.email)}`, {
      method: "DELETE",
    });
    if (res.status === 204) {
      setRows((r) => r.filter((x) => x.email !== t.email));
    } else {
      setErr((await res.json().catch(() => ({}))).error ?? "삭제하지 못했어요");
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="email">
          email
        </label>
        <input
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="h-11 flex-1 rounded-lg border border-border bg-canvas px-3 text-[16px] outline-none focus:border-primary"
          placeholder={`24.036  또는  뭐시기@${SCHOOL_DOMAIN}`}
        />
        <button
          onClick={add}
          className="h-11 rounded-lg bg-primary px-4 text-[15px] font-semibold text-white hover:bg-primary-hover"
        >
          추가
        </button>
      </div>
      {err && <p className="mt-2 text-[14px] text-danger">{err}</p>}

      <table className="mt-6 w-full text-[14px]">
        <thead className="text-left text-muted">
          <tr>
            <th className="pb-2 font-medium">이메일</th>
            <th className="pb-2 font-medium">상태</th>
            <th className="pb-2 font-medium">권한</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.email} className="border-t border-border">
              <td className="py-2 text-foreground">{r.email}</td>
              <td className="py-2">{r.status}</td>
              <td className="py-2">
                <select
                  aria-label={`${r.email} 권한`}
                  value={r.role}
                  onChange={(e) => setRole(r, e.target.value as "member" | "admin")}
                  className="rounded-md border border-border bg-canvas px-2 py-1"
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td className="py-2 text-right">
                <button onClick={() => remove(r)} className="text-danger hover:underline">
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
