import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { isPasswordLinkToken } from "@/lib/auth-links";
import { cookies } from "next/headers";
import { assertSupabaseConfigured, authCookieOptions, publicEnv } from "@/lib/env";

/** Supabase client bound to the signed-in user's session. All queries run under RLS. */
export async function createClient() {
  assertSupabaseConfigured();
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are refreshed by middleware instead.
        }
      },
    },
  });
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * True when the current session was opened from a password-reset or invitation link within the last
 * hour (see src/lib/auth-links.ts). Only those sessions may set a password without entering the current
 * one; every other signed-in user must confirm their current password (see changePasswordAction).
 *
 * `user` must come from supabase.auth.getUser(), which validated this same access token with the auth
 * server, so its claims can be read without re-verifying the signature.
 */
export async function isPasswordLinkSession(supabase: ServerClient, user: User): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? isPasswordLinkToken(session.access_token, user) : false;
}
