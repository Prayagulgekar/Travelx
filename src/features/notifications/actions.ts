"use server";
import { getActionContext } from "@/lib/auth";
import type { ActionResult } from "@/lib/errors";
import type { ActionPayload } from "@/components/shared/action-form";
import { runAction, unwrap } from "../shared";

type R = ActionResult<ActionPayload>;

export async function markNotificationsReadAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("notifications.read", async () => {
    const ctx = await getActionContext();
    const id = formData.get("id");
    let q = ctx.supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (typeof id === "string" && id) q = q.eq("id", id);
    unwrap(await q.select("id"));
    return { ok: true, message: id ? undefined : "All notifications marked as read." };
  });
}
