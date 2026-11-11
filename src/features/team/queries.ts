import "server-only";
import { cache } from "react";
import type { SessionContext } from "@/lib/auth";
import type { Member } from "@/types/models";

export const getTeam = cache(async (ctx: SessionContext): Promise<Member[]> => {
  const { data, error } = await ctx.supabase
    .from("agency_members")
    .select("id, agency_id, user_id, role, status, created_at, profile:profiles(full_name, email, phone, job_title)")
    .eq("agency_id", ctx.agency.id)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as Member[];
});

export function memberName(m: Member): string {
  return m.profile?.full_name?.trim() || m.profile?.email || "Unnamed member";
}

/** user_id -> display name, used to label assignees, note authors and audit actors without N+1 queries. */
export async function getNameDirectory(ctx: SessionContext): Promise<Map<string, string>> {
  const team = await getTeam(ctx);
  return new Map(team.map((m) => [m.user_id, memberName(m)]));
}

export async function getAssignableMembers(ctx: SessionContext): Promise<{ value: string; label: string }[]> {
  const team = await getTeam(ctx);
  return team.filter((m) => m.status === "active").map((m) => ({ value: m.user_id, label: memberName(m) }));
}
