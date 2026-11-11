import { createHash } from "node:crypto";

// Rate limiting for sensitive operations (sign-in, sign-up, password reset, invitations, payment
// recording, quotation emails).
//
// Production: counters live in Postgres (public.rate_limit_hit, called with the service role from
// src/lib/rate-limit-store.ts), so every server instance shares them. Each check is one atomic upsert.
// Fallback: if the service-role key is not configured or the database call fails, a per-instance
// in-memory window is used so requests are still limited (and the failure is logged).
// Supabase Auth applies its own limits on top of these.

export interface RateLimitResult { allowed: boolean; retryAfterSeconds: number }

export interface RateLimitStore {
  /** consume=false checks the window without counting this request. */
  hit(key: string, limit: number, windowSeconds: number, consume: boolean): Promise<RateLimitResult>;
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Per-process fixed window. Used directly in tests and as the fallback store. */
export function memoryRateLimit(key: string, limit: number, windowMs: number, now = Date.now(), consume = true): RateLimitResult {
  const bucket = buckets.get(key);
  if (!consume) {
    if (bucket && bucket.resetAt > now && bucket.count >= limit) return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Keys look like "scope:subject" (e.g. "login:1.2.3.4:a@b.com"). The subject is hashed so no raw
 * email address or IP is stored in the database.
 */
export function hashRateLimitKey(key: string): string {
  const idx = key.indexOf(":");
  const scope = idx === -1 ? "rl" : key.slice(0, idx);
  return `${scope.slice(0, 32)}:${createHash("sha256").update(key).digest("hex").slice(0, 48)}`;
}

let store: RateLimitStore | null | undefined;

/** Overrides the shared store (tests). Pass null to force the in-memory fallback. */
export function setRateLimitStore(s: RateLimitStore | null | undefined): void {
  store = s;
}

async function resolveStore(): Promise<RateLimitStore | null> {
  if (store !== undefined) return store;
  const { createSupabaseRateLimitStore } = await import("./rate-limit-store");
  store = createSupabaseRateLimitStore();
  return store;
}

/**
 * Counts this request against the window (default). With { consume: false } it only reports whether
 * the window is already exhausted, e.g. to check sign-in before the attempt and count failures only.
 */
export async function rateLimit(key: string, limit: number, windowMs: number, opts: { consume?: boolean } = {}): Promise<RateLimitResult> {
  const consume = opts.consume ?? true;
  const hashed = hashRateLimitKey(key);
  const s = await resolveStore();
  if (s) {
    try {
      return await s.hit(hashed, limit, Math.max(1, Math.ceil(windowMs / 1000)), consume);
    } catch (error) {
      console.error("[rate-limit] shared store unavailable, using in-memory fallback", error instanceof Error ? error.message : error);
    }
  }
  return memoryRateLimit(hashed, limit, windowMs, Date.now(), consume);
}
