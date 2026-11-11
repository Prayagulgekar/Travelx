import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/errors";

/**
 * Daily maintenance, triggered by Vercel Cron (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * Expires sent quotations past their validity date and creates "upcoming departure" notifications.
 */
export async function GET(request: NextRequest) {
  const { cronSecret } = serverEnv();
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;
  const ok = cronSecret.length >= 16 && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await createAdminClient().rpc("run_daily_maintenance");
    if (error) throw error;
    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    logServerError("cron.daily", error);
    return NextResponse.json({ error: "Maintenance failed" }, { status: 500 });
  }
}
