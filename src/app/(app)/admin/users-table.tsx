"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { SCHOOL_DOMAIN, normalizeEmail } from "@/lib/school";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import { useDialog } from "@/components/ui/dialog";

type Row = {
  email: string;
  role: "member" | "admin";
  status: string;
  name: string | null;
};

export function UsersTable({ initial }: { initial: Row[] }) {
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState<Row[]>(initial);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const addM = useMutation({
    mutationFn: (raw: string) =>
      apiFetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(raw) }),
      }),
    onSuccess: (data) => {
      setRows((r) => [...r, data.user]);
      setEmail("");
      setErr(null);
      toast.show("계정을 추가했어요");
    },
    onError: (e: Error) => setErr(e.message),
  });

  const roleM = useMutation({
    mutationFn: ({ email, role }: { email: string; role: "member" | "admin" }) =>
      apiFetch(`/api/admin/users/${encodeURIComponent(email)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      }),
    onMutate: ({ email, role }) => {
      const prev = rows;
      setRows((r) => r.map((x) => (x.email === email ? { ...x, role } : x)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) setRows(ctx.prev);
      toast.show(e.message, "err");
    },
  });

  const removeM = useMutation({
    mutationFn: (email: string) =>
      apiFetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: "DELETE" }),
    onMutate: (email) => {
      const prev = rows;
      setRows((r) => r.filter((x) => x.email !== email)); // optimistic
      return { prev };
    },
    onError: (e: Error, _email, ctx) => {
      if (ctx?.prev) setRows(ctx.prev);
      toast.show(e.message, "err");
    },
    onSuccess: () => toast.show("계정을 삭제했어요"),
  });

  async function remove(r: Row) {
    const ok = await dialog.confirm({
      title: "계정을 삭제할까요?",
      body: `${r.email} 계정의 접근 권한을 없애요.`,
      danger: true,
      confirmText: "삭제",
    });
    if (ok) removeM.mutate(r.email);
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
          onKeyDown={(e) => e.key === "Enter" && email.trim() && addM.mutate(email)}
          className="h-11 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none transition-colors focus:border-primary focus:bg-canvas"
          placeholder={`24.036  또는  이름@${SCHOOL_DOMAIN}`}
        />
        <Button
          onClick={() => email.trim() && addM.mutate(email)}
          size="md"
          className="h-11"
          loading={addM.isPending}
        >
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
            {rows.map((r) => {
              const removing = removeM.isPending && removeM.variables === r.email;
              return (
                <tr key={r.email} className={`border-t border-border ${removing ? "opacity-40" : ""}`}>
                  <td className="px-4 py-3 font-medium text-foreground">{r.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${
                        r.status === "active" ? "bg-weak-bg text-weak-fg" : "bg-surface text-muted"
                      }`}
                    >
                      {r.status === "active" ? "활성" : "초대됨"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`${r.email} 권한`}
                      value={r.role}
                      disabled={roleM.isPending}
                      onChange={(e) =>
                        roleM.mutate({ email: r.email, role: e.target.value as "member" | "admin" })
                      }
                      className="rounded-lg border border-border bg-canvas px-2 py-1 text-[13px] outline-none focus:border-primary disabled:opacity-50"
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove(r)}
                      disabled={removing}
                      className="rounded-md px-2 py-1 text-[13px] text-danger hover:bg-[#fdecee] disabled:opacity-50"
                    >
                      {removing ? "삭제 중…" : "삭제"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
