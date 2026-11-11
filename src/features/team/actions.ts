"use server";
import { getActionContext } from "@/lib/auth";
import { AppError, logServerError, type ActionResult } from "@/lib/errors";
import { inviteSchema, memberUpdateSchema } from "@/lib/validation/misc";
import { uuid } from "@/lib/validation/common";
import { assignableRoles, canManageMember, type Role } from "@/lib/domain/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionPayload } from "@/components/shared/action-form";
import { parseForm, runAction, unwrap } from "../shared";

type R = ActionResult<ActionPayload>;
type AdminClient = ReturnType<typeof createAdminClient>;

/** New one-time link for an invitee of this agency who has never signed in; null otherwise. */
async function reissueInvitation(admin: AdminClient, agencyId: string, userId: string, email: string): Promise<string | null> {
  const { data: member } = await admin.from("agency_members").select("id").eq("agency_id", agencyId).eq("user_id", userId).maybeSingle();
  if (!member) return null;
  const { data: user } = await admin.auth.admin.getUserById(userId);
  if (!user.user || user.user.last_sign_in_at) return null;
  const link = await admin.auth.admin.generateLink({ type: "recovery", email });
  const hashed = link.data?.properties?.hashed_token;
  return hashed ? `${publicEnv.siteUrl}/auth/confirm?token_hash=${hashed}&type=recovery` : null;
}

/**
 * Invites a team member. Uses the service role (server only) because creating auth users and
 * memberships for someone else cannot be done with the inviter's own session. The caller's role
 * is checked first; admins may only invite travel agents.
 *
 * Supabase's generateLink does not send email, so the one-time invitation link is returned to
 * the inviter to share. If SMTP is configured in Supabase, the person can also use "Forgot password".
 */
export async function inviteMemberAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("team.invite", async () => {
    const ctx = await getActionContext("team.manage_agents");
    if (!(await rateLimit(`invite:${ctx.userId}`, 10, 60 * 60 * 1000)).allowed) throw new AppError("Too many invitations. Try again later.", 429);
    const input = parseForm(inviteSchema, formData);
    if (!assignableRoles(ctx.role).includes(input.role)) throw new AppError("You cannot invite someone with that role.", 403, { role: "Not permitted." });

    const admin = createAdminClient();
    const email = input.email.trim().toLowerCase(); // GoTrue stores emails lower-cased

    // Existing account? Never create, modify or delete it here. A pending invitee of THIS agency
    // (never signed in) gets a fresh one-time link; anyone else is a conflict.
    const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (existing) {
      const fresh = await reissueInvitation(admin, ctx.agency.id, existing.id as string, email);
      if (fresh) return { ok: true, message: "This person was already invited. A new one-time link was generated.", data: { inviteUrl: fresh } };
      throw new AppError("A user with this email already exists.", 409, { email: "Already registered." });
    }

    const redirectTo = `${publicEnv.siteUrl}/auth/confirm?next=/reset-password`;
    const link = await admin.auth.admin.generateLink({
      type: "invite", email,
      options: { data: { full_name: input.full_name }, redirectTo },
    });
    if (link.error || !link.data.user) {
      if (link.error?.message?.toLowerCase().includes("already")) throw new AppError("A user with this email already exists.", 409, { email: "Already registered." });
      throw link.error ?? new AppError("Could not create the invitation.");
    }
    const userId = link.data.user.id;
    const createdNow = !link.data.user.last_sign_in_at && Date.now() - new Date(link.data.user.created_at).getTime() < 5 * 60 * 1000;
    await admin.auth.admin.updateUserById(userId, { app_metadata: { invited: true } });
    const member = await admin.from("agency_members").insert({ agency_id: ctx.agency.id, user_id: userId, role: input.role, status: "active", invited_by: ctx.userId });
    if (member.error) {
      // Remove the login only if this request just created it, so no orphaned account is left behind.
      if (createdNow) await admin.auth.admin.deleteUser(userId);
      if (member.error.code === "23505") throw new AppError("This person already belongs to an agency workspace.", 409, { email: "Already a member elsewhere." });
      throw member.error;
    }
    await admin.from("profiles").update({ full_name: input.full_name }).eq("id", userId);
    const hashed = link.data.properties?.hashed_token;
    const inviteUrl = hashed ? `${publicEnv.siteUrl}/auth/confirm?token_hash=${hashed}&type=invite&next=/reset-password` : null;
    return { ok: true, message: `${input.full_name} was added to the team.`, data: { inviteUrl } };
  });
}

export async function updateMemberAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("team.update", async () => {
    const ctx = await getActionContext("team.manage_agents");
    const id = uuid("Member").parse(formData.get("id"));
    const input = parseForm(memberUpdateSchema, formData);
    const target = unwrap(await ctx.supabase.from("agency_members").select("user_id, role, status").eq("id", id).single()) as { user_id: string; role: Role; status: string };
    if (target.user_id === ctx.userId) throw new AppError("You cannot change your own role or status.");
    if (!canManageMember(ctx.role, target.role) || !assignableRoles(ctx.role).includes(input.role)) throw new AppError("You cannot manage this team member.", 403);
    unwrap(await ctx.supabase.from("agency_members").update({ role: input.role, status: input.status }).eq("id", id).select("id"));
    // Membership status plus RLS hides all agency data from a suspended member immediately. Banning the
    // login as well refuses new sign-ins and token refreshes, so their remaining session ends when its
    // access token expires (at most the JWT expiry, 1 hour by default) instead of lingering on the
    // "no access" page for days. Reactivating lifts the ban. TravelX allows one agency per login, so this
    // cannot lock the person out of another workspace.
    if (input.status !== target.status) {
      const { error } = await createAdminClient().auth.admin.updateUserById(target.user_id, {
        ban_duration: input.status === "suspended" ? "876000h" : "none",
      });
      if (error) {
        logServerError("team.update.ban", error);
        return { ok: true, message: "Team member updated, but their current sign-in could not be ended. They still cannot see any agency data." };
      }
    }
    return { ok: true, message: "Team member updated." };
  });
}
