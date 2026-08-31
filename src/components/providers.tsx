"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import { DialogProvider } from "@/components/ui/dialog";
import { UploadProvider } from "@/components/upload/upload-provider";
import { UploadTray } from "@/components/upload/upload-tray";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DialogProvider>
          <UploadProvider>
            {children}
            <UploadTray />
          </UploadProvider>
        </DialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** fetch + throw on !ok, parsing {error} */
export async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "요청에 실패했어요");
  return data;
}
