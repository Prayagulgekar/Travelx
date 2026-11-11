"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createClient, isPasswordLinkSession } from "@/lib/supabase/server";
import { AppError, type ActionResult } from "@/lib/errors";
import { changePasswordSchema, loginSchema, newPasswordSchema, resetRequestSchema, signupSchema } from "@/lib/validation/misc";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/utils";
import type { ActionPayload } from "@/components/shared/action-form";
import { parseForm, runAction } from "../shared";

type R = ActionResult<ActionPayload>;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function loginAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("auth.login", async () => {
    const input = parseForm(loginSchema, formData);
    const ip = await clientIp();
    // Failed attempts are limited per IP+account and per account (so rotating or spoofed IPs cannot
    // brute-force one login). Successful sign-ins are not counted.
    const email = input.email.toLowerCase();
    const limits = [
      { key: `login-account:${email}`, limit: 20, windowMs: 15 * 60 * 1000 },
      { key: `login:${ip}:${email}`, limit: 8, windowMs: 10 * 60 * 1000 },
    ];
    for (const l of limits) {
      const state = await rateLimit(l.key, l.limit, l.windowMs, { consume: false });
      if (!state.allowed) throw new AppError(`Too many sign-in attempts. Try again in ${Math.ceil(state.retryAfterSeconds / 60)} minute(s).`, 429);
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) {
      await Promise.all(limits.map((l) => rateLimit(l.key, l.limit, l.windowMs)));
      // Same message for unknown email and wrong password, to avoid account enumeration.
      throw new AppError("Incorrect email or password.", 401);
    }
    return { ok: true, data: { redirectTo: safeRedirectPath(String(formData.get("next") ?? "")) } };
  });
}

export async function signupAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("auth.signup", async () => {
    const input = parseForm(signupSchema, formData);
    const ip = await clientIp();
    if (!(await rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000)).allowed) throw new AppError("Too many sign-up attempts. Try again later.", 429);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email, password: input.password,
      options: {
        emailRedirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/dashboard`,
        data: { full_name: input.full_name, agency_name: input.agency_name, currency: input.currency },
      },
    });
    if (error) throw new AppError(error.message.includes("registered") ? "An account with this email already exists." : "Could not create the account. Please try again.");
    if (!data.session) {
      return { ok: true, message: "Check your inbox to confirm your email address, then sign in.", data: { redirectTo: "/login?confirm=1" } };
    }
    return { ok: true, message: "Workspace created. Welcome to TravelX.", data: { redirectTo: "/dashboard" } };
  });
}

export async function requestPasswordResetAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("auth.reset_request", async () => {
    const input = parseForm(resetRequestSchema, formData);
    const ip = await clientIp();
    if (!(await rateLimit(`reset:${ip}`, 5, 15 * 60 * 1000)).allowed) throw new AppError("Too many requests. Try again later.", 429);
    const generic = { ok: true as const, message: "If an account exists for that email, a reset link is on its way." };
    // Per-address cap stops someone flooding a victim's inbox from many IPs; the response stays identical.
    if (!(await rateLimit(`reset-account:${input.email.toLowerCase()}`, 3, 60 * 60 * 1000)).allowed) return generic;
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(input.email, { redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/reset-password` });
    // Always the same response, whether or not the address exists.
    return generic;
  });
}

export async function setNewPasswordAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("auth.set_password", async () => {
    const input = parseForm(newPasswordSchema, formData);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AppError("Your reset link has expired. Request a new one.", 401);
    // Without a fresh reset/invitation link, a password change must go through changePasswordAction,
    // which asks for the current password (a stolen session alone must not be able to take over the account).
    if (!(await isPasswordLinkSession(supabase, user))) throw new AppError("Your reset link has expired. Request a new one.", 401);
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) throw new AppError(error.message.includes("different") ? "Choose a password different from your current one." : "Could not update the password.");
    // End every other session for this account (e.g. a device where the old password was compromised).
    await supabase.auth.signOut({ scope: "others" });
    return { ok: true, message: "Password updated. Other devices have been signed out.", data: { redirectTo: "/dashboard" } };
  });
}

/** Password change for a signed-in user: requires the current password; other sessions are signed out. */
export async function changePasswordAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("auth.change_password", async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) throw new AppError("Your session has expired. Please sign in again.", 401);
    const input = parseForm(changePasswordSchema, formData);
    if (!(await rateLimit(`change-password:${user.id}`, 10, 15 * 60 * 1000)).allowed) throw new AppError("Too many attempts. Try again later.", 429);

    // Check the current password on a separate, cookie-less client so the user's own session is untouched.
    // The temporary session it creates is revoked straight away.
    const verifier = createStatelessClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const check = await verifier.auth.signInWithPassword({ email: user.email, password: input.current_password });
    if (check.error || !check.data.session) {
      throw new AppError("Your current password is incorrect.", 422, { current_password: "Incorrect password." });
    }
    await verifier.auth.signOut({ scope: "local" });

    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) throw new AppError(error.message.includes("different") ? "Choose a password different from your current one." : "Could not update the password.");
    await supabase.auth.signOut({ scope: "others" });
    return { ok: true, message: "Password changed. Other devices have been signed out.", data: { redirectTo: "/profile" } };
  });
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
