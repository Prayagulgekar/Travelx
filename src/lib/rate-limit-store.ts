import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import type { RateLimitStore } from "@/lib/rate-limit";

/** Shared rate-limit store backed by public.rate_limit_hit (service role only). Null when not configured. */
export function createSupabaseRateLimitStore(): RateLimitStore | null {
  const { serviceRoleKey } = serverEnv();
  if (!publicEnv.supabaseUrl || !serviceRoleKey) {
    console.warn("[rate-limit] SUPABASE_SERVICE_ROLE_KEY not set: using per-instance in-memory rate limiting.");
    return null;
  }
  const client = createClient(publicEnv.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async hit(key, limit, windowSeconds, consume) {
      const { data, error } = await client.rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds, p_consume: consume });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; retry_after_seconds: number } | undefined;
      if (!row) throw new Error("rate_limit_hit returned no row");
      return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
    },
  };
}
