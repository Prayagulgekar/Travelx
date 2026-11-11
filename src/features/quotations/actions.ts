"use server";
import { getActionContext } from "@/lib/auth";
import { AppError, type ActionResult } from "@/lib/errors";
import { quotationSchema, quotationStatusSchema } from "@/lib/validation/quotations";
import { uuid } from "@/lib/validation/common";
import { calculateQuotationTotals, discountWithinAgentLimit, PricingError } from "@/lib/domain/pricing";
import { canTransitionQuotation, type QuotationStatus } from "@/lib/domain/status";
import { can } from "@/lib/domain/permissions";
import { escapeHtml, getEmailProvider } from "@/lib/email";
import { renderQuotationPdf } from "@/lib/pdf/documents";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionPayload } from "@/components/shared/action-form";
import { parseForm, runAction, unwrap } from "../shared";
import { getQuotation } from "./queries";

type R = ActionResult<ActionPayload>;

/**
 * Line items arrive as a JSON string from the quotation builder. Only quantity, unit price,
 * tax rate, category and description are accepted; any totals the browser computed are ignored
 * and the database recomputes everything (see private.quotation_compute_totals).
 */
function readQuotationForm(formData: FormData) {
  let items: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    throw new AppError("Line items could not be read. Please try again.");
  }
  const raw: Record<string, unknown> = {};
  for (const k of ["enquiry_id", "title", "issue_date", "valid_until", "terms", "payment_terms", "internal_notes", "discount_type", "discount_value"]) {
    raw[k] = formData.get(k) ?? undefined;
  }
  raw.items = items;
  return parseForm(quotationSchema, raw);
}

export async function saveQuotationAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("quotations.save", async () => {
    const ctx = await getActionContext();
    const idRaw = formData.get("id");
    const id = idRaw ? uuid("Quotation").parse(idRaw) : null;
    const input = readQuotationForm(formData);

    // Pre-validate with the same pricing rules the DB enforces, for clearer messages.
    try {
      const totals = calculateQuotationTotals(
        input.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unit_price, taxRate: i.tax_rate })),
        { type: input.discount_type, value: input.discount_value },
      );
      if (!can(ctx.role, "quotations.discount_unlimited") &&
          !discountWithinAgentLimit(totals.subtotal, totals.discountAmount, ctx.agency.max_agent_discount_percent)) {
        throw new AppError(`Travel agents can apply discounts up to ${ctx.agency.max_agent_discount_percent}% of the subtotal.`, 403,
          { discount_value: "Above your approval limit." });
      }
    } catch (e) {
      if (e instanceof PricingError) throw new AppError(e.message, 422, { discount_value: e.message });
      throw e;
    }

    const header = {
      enquiry_id: input.enquiry_id, title: input.title, issue_date: input.issue_date, valid_until: input.valid_until,
      terms: input.terms ?? "", payment_terms: input.payment_terms ?? "", internal_notes: input.internal_notes ?? "",
      discount_type: input.discount_type, discount_value: input.discount_type === "none" ? "0" : input.discount_value,
    };
    const items = input.items.map((i) => ({ category: i.category, description: i.description, quantity: i.quantity, unit_price: i.unit_price, tax_rate: i.tax_rate }));
    const savedId = unwrap(await ctx.supabase.rpc("save_quotation", { p_quotation_id: id, p_header: header, p_items: items })) as string;
    return { ok: true, message: id ? "Quotation saved." : "Quotation created as a draft.", data: { redirectTo: `/quotations/${savedId}` } };
  });
}

export async function changeQuotationStatusAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("quotations.status", async () => {
    const ctx = await getActionContext();
    const id = uuid("Quotation").parse(formData.get("id"));
    const { status, reason } = parseForm(quotationStatusSchema, formData);
    const current = unwrap(await ctx.supabase.from("quotations").select("status").eq("id", id).single()) as { status: QuotationStatus };
    if (!canTransitionQuotation(current.status, status)) {
      throw new AppError(`A ${current.status} quotation cannot be marked ${status}.`);
    }
    if (status === "reviewed" && !can(ctx.role, "quotations.review")) {
      throw new AppError("Only owners and administrators can mark a quotation as reviewed.", 403);
    }
    const patch: Record<string, unknown> = { status };
    if (status === "rejected") patch.rejection_reason = reason ?? null;
    unwrap(await ctx.supabase.from("quotations").update(patch).eq("id", id).select("id"));
    const messages: Partial<Record<QuotationStatus, string>> = {
      reviewed: "Quotation marked as reviewed.", draft: "Quotation moved back to draft.", sent: "Quotation marked as sent.",
      accepted: "Quotation accepted. You can now convert it into a booking.", rejected: "Quotation marked as rejected.", expired: "Quotation marked as expired.",
    };
    return { ok: true, message: messages[status] ?? "Quotation updated." };
  });
}

export async function duplicateQuotationAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("quotations.duplicate", async () => {
    const ctx = await getActionContext();
    const id = uuid("Quotation").parse(formData.get("id"));
    const newId = unwrap(await ctx.supabase.rpc("duplicate_quotation", { p_quotation_id: id })) as string;
    return { ok: true, message: "Quotation duplicated as a new draft.", data: { redirectTo: `/quotations/${newId}/edit` } };
  });
}

export async function deleteQuotationAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("quotations.delete", async () => {
    const ctx = await getActionContext();
    const id = uuid("Quotation").parse(formData.get("id"));
    const enquiryId = String(formData.get("enquiry_id") ?? "");
    const rows = unwrap(await ctx.supabase.from("quotations").delete().eq("id", id).eq("status", "draft").select("id"));
    if (rows.length === 0) throw new AppError("Only draft quotations you created can be deleted.");
    return { ok: true, message: "Draft quotation deleted.", data: { redirectTo: enquiryId ? `/enquiries/${enquiryId}` : "/quotations" } };
  });
}

export async function convertToBookingAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("quotations.convert", async () => {
    const ctx = await getActionContext();
    const id = uuid("Quotation").parse(formData.get("id"));
    const notes = String(formData.get("notes") ?? "").trim().slice(0, 4000) || null;
    const bookingId = unwrap(await ctx.supabase.rpc("convert_quotation_to_booking", { p_quotation_id: id, p_notes: notes })) as string;
    return { ok: true, message: "Booking created from the accepted quotation.", data: { redirectTo: `/bookings/${bookingId}` } };
  });
}

/** Emails the quotation PDF. Reports success only when the provider accepted the message. */
export async function emailQuotationAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("quotations.email", async () => {
    const ctx = await getActionContext();
    const provider = getEmailProvider();
    if (!provider) throw new AppError("Email is not configured for this workspace. Download the PDF and send it manually.");
    if (!(await rateLimit(`email:${ctx.userId}`, 20, 60 * 60 * 1000)).allowed) throw new AppError("Too many emails sent. Try again later.", 429);
    const id = uuid("Quotation").parse(formData.get("id"));
    const data = await getQuotation(ctx, id);
    if (!data) throw new AppError("Quotation not found.", 404);
    const { quotation: q, items } = data;
    if (q.status !== "reviewed" && q.status !== "sent") throw new AppError("Only reviewed or sent quotations can be emailed.");
    const to = q.customer?.email;
    if (!to) throw new AppError("This customer has no email address on file.");
    const pdf = await renderQuotationPdf(ctx.agency, q, items);
    const result = await provider.send({
      to,
      subject: `${ctx.agency.name}: quotation ${q.quotation_code} - ${q.title}`,
      text: `Dear ${q.customer?.full_name},\n\nPlease find attached our quotation ${q.quotation_code} for ${q.enquiry?.destination ?? "your trip"}. It is valid until ${q.valid_until}.\n\nRegards,\n${ctx.agency.name}`,
      html: `<p>Dear ${escapeHtml(q.customer?.full_name ?? "")},</p><p>Please find attached our quotation <strong>${escapeHtml(q.quotation_code)}</strong> for ${escapeHtml(q.enquiry?.destination ?? "your trip")}. It is valid until ${escapeHtml(q.valid_until)}.</p><p>Regards,<br>${escapeHtml(ctx.agency.name)}</p>`,
      replyTo: ctx.agency.email ?? undefined,
      attachments: [{ filename: `${q.quotation_code}.pdf`, content: pdf }],
    });
    if (!result.ok) throw new AppError(`The email was not sent: ${result.error}`);
    if (q.status === "reviewed") unwrap(await ctx.supabase.from("quotations").update({ status: "sent" }).eq("id", id).select("id"));
    return { ok: true, message: `Quotation emailed to ${to}.` };
  });
}
