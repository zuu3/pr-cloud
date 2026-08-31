"use client";

import { useState } from "react";
import { SCHOOL_DOMAIN, normalizeEmail } from "@/lib/school";
import { Button } from "@/components/ui/button";

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
          이메일 또는 학번
        </label>
        <input
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="h-11 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none transition-colors focus:border-primary focus:bg-canvas"
          placeholder={`24.036  또는  이름@${SCHOOL_DOMAIN}`}
        />
        <Button onClick={add} size="md" className="h-11">
          추가
        </Button>
      </div>
      <p className="mt-1.5 text-[12px] text-muted">
        학번만 입력하면 {`@${SCHOOL_DOMAIN}`}이 자동으로 붙어요.
      </p>
      {err && <p className="mt-2 text-[13px] text-danger">{err}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="bg-surface text-left text-[12px] font-medium text-muted">
              <th className="px-4 py-2.5">이메일</th>
              <th className="px-4 py-2.5">상태</th>
              <th className="px-4 py-2.5">권한</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.email} className="border-t border-border">
                <td className="px-4 py-3 font-medium text-foreground">{r.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${
                      r.status === "active"
                        ? "bg-weak-bg text-weak-fg"
                        : "bg-surface text-muted"
                    }`}
                  >
                    {r.status === "active" ? "활성" : "초대됨"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`${r.email} 권한`}
                    value={r.role}
                    onChange={(e) => setRole(r, e.target.value as "member" | "admin")}
                    className="rounded-lg border border-border bg-canvas px-2 py-1 text-[13px] outline-none focus:border-primary"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(r)}
                    className="rounded-md px-2 py-1 text-[13px] text-danger hover:bg-[#fdecee]"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
