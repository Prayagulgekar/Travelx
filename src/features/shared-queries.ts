import "server-only";
import type { SessionContext } from "@/lib/auth";
import type { ActivityLog } from "@/types/models";

export async function getActivity(ctx: SessionContext, entityId: string, includeChildren = false, limit = 50): Promise<ActivityLog[]> {
  let q = ctx.supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  q = includeChildren ? q.or(`entity_id.eq.${entityId},parent_entity_id.eq.${entityId}`) : q.eq("entity_id", entityId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}
