"use client";
import * as React from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error";
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ToastApi { success: (m: string) => void; error: (m: string) => void }

const ToastContext = React.createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const remove = React.useCallback((id: number) => setItems((s) => s.filter((t) => t.id !== id)), []);
  const push = React.useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { id, kind, message }]);
    window.setTimeout(() => remove(id), kind === "error" ? 7000 : 4000);
  }, [remove]);
  const api = React.useMemo<ToastApi>(() => ({ success: (m) => push("success", m), error: (m) => push("error", m) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100%-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} data-testid={`toast-${t.kind}`} className={cn("pointer-events-auto flex items-start gap-2.5 rounded-md border bg-card px-3.5 py-3 text-sm shadow-pop", t.kind === "error" ? "border-danger/30" : "border-success/30")}>
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />}
            <p className="flex-1 leading-snug">{t.message}</p>
            <button type="button" onClick={() => remove(t.id)} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Dismiss notification">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
