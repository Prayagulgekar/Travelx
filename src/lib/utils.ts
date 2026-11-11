import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Escapes user input for use inside a PostgREST `ilike` / `or` filter. */
export function escapeFilterValue(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[(),."']/g, " ").trim().slice(0, 80);
}

export const PAGE_SIZE = 20;

export function pageRange(page: number, size = PAGE_SIZE): { from: number; to: number } {
  const p = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  return { from: (p - 1) * size, to: p * size - 1 };
}

export function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  });
  return out;
}

/** Only allow same-origin relative redirects (prevents open redirects via ?next=). */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
