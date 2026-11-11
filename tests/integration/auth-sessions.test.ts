import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { isPasswordLinkToken } from "@/lib/auth-links";
import { admin, anon, createAgency, PASSWORD, signIn, stackAvailable } from "./helpers";

// Facts about Supabase Auth (GoTrue) that the app relies on:
//  - sessions opened from reset/invitation links are recognised by src/lib/auth-links.ts, which decides
//    whether a password may be set without the current one;
//  - banning a login refuses sign-in and token refresh (src/features/team/actions.ts suspends members this way);
//  - a cookie-less sign-in used to check the current password can be revoked on its own.

describe.skipIf(!stackAvailable)("auth sessions", () => {
  it("recognises sessions from invitation and reset links, and not password or sign-up sessions", async () => {
    const email = `link-${randomUUID().slice(0, 8)}@test.local`;
    const sa = admin();
    const invite = await sa.auth.admin.generateLink({ type: "invite", email });
    expect(invite.error).toBeNull();
    const c1 = anon();
    const v1 = await c1.auth.verifyOtp({ type: "invite", token_hash: invite.data.properties!.hashed_token });
    expect(v1.error).toBeNull();
    const u1 = (await c1.auth.getUser()).data.user!;
    expect(isPasswordLinkToken(v1.data.session!.access_token, u1)).toBe(true);

    await c1.auth.updateUser({ password: PASSWORD });
    const recovery = await sa.auth.admin.generateLink({ type: "recovery", email });
    const c2 = anon();
    const v2 = await c2.auth.verifyOtp({ type: "recovery", token_hash: recovery.data.properties!.hashed_token });
    expect(v2.error).toBeNull();
    // Refreshing keeps it a link session (the server refreshes tokens transparently).
    const refreshed = (await c2.auth.refreshSession()).data.session!;
    expect(isPasswordLinkToken(refreshed.access_token, (await c2.auth.getUser()).data.user!)).toBe(true);

    // A normal password sign-in is not a link session, even right after a reset link was issued.
    const normal = await signIn(email);
    const { data: { session } } = await normal.auth.getSession();
    expect(isPasswordLinkToken(session!.access_token, (await normal.auth.getUser()).data.user!)).toBe(false);

    // A sign-up confirmation link is not a password link either.
    const signupEmail = `signup-${randomUUID().slice(0, 8)}@test.local`;
    const signup = await sa.auth.admin.generateLink({ type: "signup", email: signupEmail, password: PASSWORD });
    expect(signup.error).toBeNull();
    const c3 = anon();
    const v3 = await c3.auth.verifyOtp({ type: "signup", token_hash: signup.data.properties!.hashed_token });
    expect(v3.error).toBeNull();
    expect(isPasswordLinkToken(v3.data.session!.access_token, (await c3.auth.getUser()).data.user!)).toBe(false);
  });

  it("a ban blocks sign-in and token refresh until it is lifted", async () => {
    const a = await createAgency("ban");
    const sa = admin();
    const { data: { session } } = await a.agent.auth.getSession();
    const { data: u } = await sa.auth.admin.getUserById(a.agentId);
    const email = u.user!.email!;

    const ban = await sa.auth.admin.updateUserById(a.agentId, { ban_duration: "876000h" });
    expect(ban.error).toBeNull();
    expect((await anon().auth.refreshSession({ refresh_token: session!.refresh_token })).error).not.toBeNull();
    expect((await anon().auth.signInWithPassword({ email, password: PASSWORD })).error).not.toBeNull();

    const unban = await sa.auth.admin.updateUserById(a.agentId, { ban_duration: "none" });
    expect(unban.error).toBeNull();
    expect((await anon().auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
  });

  it("a stateless sign-in used to check the current password can be revoked without touching the user's session", async () => {
    const a = await createAgency("verify");
    const { data: u } = await admin().auth.admin.getUserById(a.ownerId);
    const verifier = anon();
    const check = await verifier.auth.signInWithPassword({ email: u.user!.email!, password: PASSWORD });
    expect(check.error).toBeNull();
    await verifier.auth.signOut({ scope: "local" });
    expect((await verifier.auth.refreshSession({ refresh_token: check.data.session!.refresh_token })).error).not.toBeNull();
    // The owner's own session still works.
    expect((await a.owner.auth.getUser()).error).toBeNull();
    // A wrong password is rejected.
    expect((await anon().auth.signInWithPassword({ email: u.user!.email!, password: "wrong-password-123" })).error).not.toBeNull();
  });
});
