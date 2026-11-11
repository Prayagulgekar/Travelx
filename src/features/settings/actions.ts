"use server";
import { getActionContext } from "@/lib/auth";
import type { ActionResult } from "@/lib/errors";
import { agencySchema, profileSchema } from "@/lib/validation/misc";
import type { ActionPayload } from "@/components/shared/action-form";
import { nullable, parseForm, runAction, unwrap } from "../shared";

type R = ActionResult<ActionPayload>;

export async function updateAgencyAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("settings.agency", async () => {
    const ctx = await getActionContext("agency.manage");
    const i = parseForm(agencySchema, formData);
    unwrap(await ctx.supabase.from("agencies").update({
      name: i.name, legal_name: nullable(i.legal_name), email: nullable(i.email), phone: nullable(i.phone), website: nullable(i.website),
      address: nullable(i.address), city: nullable(i.city), country: nullable(i.country), tax_id: nullable(i.tax_id), currency: i.currency,
      default_tax_rate: i.default_tax_rate, max_agent_discount_percent: i.max_agent_discount_percent,
      quotation_validity_days: i.quotation_validity_days, quotation_terms: nullable(i.quotation_terms), payment_terms: nullable(i.payment_terms),
    }).eq("id", ctx.agency.id).select("id"));
    return { ok: true, message: "Agency settings saved." };
  });
}

export async function updateProfileAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("settings.profile", async () => {
    const ctx = await getActionContext();
    const i = parseForm(profileSchema, formData);
    unwrap(await ctx.supabase.from("profiles").update({ full_name: i.full_name, phone: nullable(i.phone), job_title: nullable(i.job_title) }).eq("id", ctx.userId).select("id"));
    return { ok: true, message: "Profile updated." };
  });
}
