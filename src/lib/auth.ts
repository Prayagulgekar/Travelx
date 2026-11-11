import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, type Capability, type Role } from "@/lib/domain/permissions";
import { AuthError, ForbiddenError } from "@/lib/errors";
import type { Agency, Profile } from "@/types/models";

export interface SessionContext {
  userId: string;
  email: string;
  profile: Profile;
  role: Role;
  agency: Agency;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

type LoadResult =
  | { kind: "anonymous" }
  | { kind: "no_membership"; email: string; status: string | null }
  | { kind: "ok"; ctx: SessionContext };

// Cached per request so layouts, pages and actions share one auth round-trip.
const loadSession = cache(async (): Promise<LoadResult> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: "anonymous" };

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase.from("agency_members").select("role, status, agency:agencies(*)").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
  ]);
  const agency = (membership as { agency: Agency | null } | null)?.agency ?? null;
  if (!membership || membership.status !== "active" || !agency) {
    return { kind: "no_membership", email: user.email ?? "", status: membership?.status ?? null };
  }
  return {
    kind: "ok",
    ctx: {
      userId: user.id,
      email: user.email ?? "",
      profile: (profile as Profile | null) ?? { id: user.id, full_name: "", email: user.email ?? "", phone: null, job_title: null, created_at: "", updated_at: "" },
      role: membership.role as Role,
      agency,
      supabase,
    },
  };
});

/** For pages/layouts: redirects anonymous users to sign-in. */
export async function requireSession(): Promise<SessionContext> {
  const result = await loadSession();
  if (result.kind === "anonymous") redirect("/login");
  if (result.kind === "no_membership") redirect("/no-access");
  return result.ctx;
}

/** For pages: renders the 403 route if the capability is missing. */
export async function requireCapability(capability: Capability): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!can(ctx.role, capability)) redirect("/forbidden");
  return ctx;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function getActionContext(capability?: Capability): Promise<SessionContext> {
  const result = await loadSession();
  if (result.kind === "anonymous") throw new AuthError();
  if (result.kind === "no_membership") throw new ForbiddenError("Your account is not active in an agency workspace.");
  if (capability && !can(result.ctx.role, capability)) throw new ForbiddenError();
  return result.ctx;
}

export async function getMembershipState() {
  return loadSession();
}
