"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "./button";

type PromptOpts = {
  title: string;
  label?: string;
  initial?: string;
  confirmText?: string;
  maxLength?: number;
};
type ConfirmOpts = { title: string; body?: string; confirmText?: string; danger?: boolean };

type Ctx = {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
};

const DialogCtx = createContext<Ctx | null>(null);

export function useDialog() {
  const c = useContext(DialogCtx);
  if (!c) throw new Error("useDialog must be used within <DialogProvider>");
  return c;
}

type State =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | null;

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const promptValue = () => inputRef.current?.value.trim() || null;

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setState({ kind: "confirm", opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => setState({ kind: "prompt", opts, resolve })),
    [],
  );

  function close(value: boolean | string | null) {
    if (!state) return;
    state.resolve(value as never);
    setState(null);
  }

  return (
    <DialogCtx.Provider value={{ confirm, prompt }}>
      {children}
      <AnimatePresence>
        {state && (
          <motion.div
            key="dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 px-6"
            onClick={() => close(state.kind === "confirm" ? false : null)}
          >
            <motion.div
              role="dialog"
              aria-modal
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="w-full max-w-[360px] rounded-2xl bg-canvas p-5 shadow-[0_16px_48px_-12px_rgba(25,31,40,0.3)]"
              onClick={(e) => e.stopPropagation()}
            >
            <h2 className="text-[17px] font-bold text-foreground">{state.opts.title}</h2>

            {state.kind === "confirm" && state.opts.body && (
              <p className="mt-2 text-[14px] leading-[1.6] text-body">{state.opts.body}</p>
            )}

            {state.kind === "prompt" && (
              <div className="mt-3">
                {state.opts.label && (
                  <label className="text-[13px] text-muted">{state.opts.label}</label>
                )}
                <input
                  ref={inputRef}
                  autoFocus
                  maxLength={state.opts.maxLength}
                  defaultValue={state.opts.initial ?? ""}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") close(promptValue());
                    if (e.key === "Escape") close(null);
                  }}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none focus:border-primary focus:bg-canvas"
                />
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => close(state.kind === "confirm" ? false : null)}
              >
                취소
              </Button>
              <Button
                variant={state.kind === "confirm" && state.opts.danger ? "danger" : "primary"}
                size="md"
                onClick={() => close(state.kind === "confirm" ? true : promptValue())}
              >
                {state.opts.confirmText ?? (state.kind === "confirm" ? "확인" : "저장")}
              </Button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DialogCtx.Provider>
  );
}
