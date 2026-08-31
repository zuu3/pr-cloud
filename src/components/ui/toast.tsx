"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Toast = { id: number; text: string; tone: "ok" | "err" };
type Ctx = { show: (text: string, tone?: "ok" | "err") => void };

const ToastCtx = createContext<Ctx | null>(null);

export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast must be used within <ToastProvider>");
  return c;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const show = useCallback((text: string, tone: "ok" | "err" = "ok") => {
    const id = ++seq.current;
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl px-4 py-2.5 text-[14px] font-medium shadow-[0_8px_24px_-8px_rgba(25,31,40,0.25)] ${
              t.tone === "ok" ? "bg-foreground text-white" : "bg-danger text-white"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
