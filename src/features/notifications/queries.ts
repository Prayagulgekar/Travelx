import "server-only";
import type { SessionContext } from "@/lib/auth";
import type { NotificationRow } from "@/types/models";

export async function getUnreadCount(ctx: SessionContext): Promise<number> {
  const { count } = await ctx.supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export async function listNotifications(ctx: SessionContext, limit = 50): Promise<NotificationRow[]> {
  const { data, error } = await ctx.supabase.from("notifications").select("id, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}
