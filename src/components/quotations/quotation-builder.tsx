"use client";
import Link from "next/link";
import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { budgetDifference, budgetStatus, calculateDiscount, priceLine, QUOTATION_ITEM_CATEGORIES, type DiscountType, type QuotationItemCategory } from "@/lib/domain/pricing";
import { Decimal } from "@/lib/domain/money";
import { CATEGORY_LABELS } from "@/lib/validation/quotations";
import { formatMoney } from "@/lib/format";
import { saveQuotationAction } from "@/features/quotations/actions";

export interface BuilderItem { key: string; category: QuotationItemCategory; description: string; quantity: string; unit_price: string; tax_rate: string }

interface Props {
  quotationId?: string;
  enquiry: { id: string; enquiry_code: string; destination: string; budget: string | number | null; currency: string; nights: number; travellers: number; rooms: number };
  initial: {
    title: string; issue_date: string; valid_until: string; terms: string; payment_terms: string; internal_notes: string;
    discount_type: DiscountType; discount_value: string; items: BuilderItem[];
  };
  defaultTaxRate: string;
  agentDiscountLimit: string | null;
}

const isNum = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());

/** Interactive quotation editor. Totals shown here are a preview; the server recalculates them. */
export function QuotationBuilder({ quotationId, enquiry, initial, defaultTaxRate, agentDiscountLimit }: Props) {
  const [items, setItems] = React.useState<BuilderItem[]>(initial.items);
  const [discountType, setDiscountType] = React.useState<DiscountType>(initial.discount_type);
  const [discountValue, setDiscountValue] = React.useState(initial.discount_value);
  const cur = enquiry.currency;

  const preview = React.useMemo(() => {
    let subtotal = new Decimal(0), tax = new Decimal(0);
    const lines = items.map((i) => {
      if (!isNum(i.quantity) || !isNum(i.unit_price) || !isNum(i.tax_rate || "0") || Number(i.quantity) <= 0) return null;
      try {
        const p = priceLine({ quantity: i.quantity, unitPrice: i.unit_price, taxRate: i.tax_rate || "0" });
        subtotal = subtotal.plus(p.subtotal); tax = tax.plus(p.tax);
        return p;
      } catch { return null; }
    });
    let discount = new Decimal(0); let discountError: string | null = null;
    try { discount = calculateDiscount(subtotal, { type: discountType, value: isNum(discountValue || "0") ? discountValue || "0" : "0" }); }
    catch (e) { discountError = (e as Error).message; }
    const grand = subtotal.plus(tax).minus(discount);
    const overAgentLimit = agentDiscountLimit !== null && discount.gt(subtotal.times(agentDiscountLimit).dividedBy(100));
    return { lines, subtotal, tax, discount, grand, discountError, overAgentLimit };
  }, [items, discountType, discountValue, agentDiscountLimit]);

  const status = budgetStatus(enquiry.budget, preview.grand.toFixed(2));
  const diff = budgetDifference(enquiry.budget, preview.grand.toFixed(2));

  const update = (key: string, patch: Partial<BuilderItem>) => setItems((s) => s.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const add = (category: QuotationItemCategory = "accommodation") =>
    setItems((s) => [...s, { key: crypto.randomUUID(), category, description: "", quantity: "1", unit_price: "", tax_rate: defaultTaxRate }]);
  const move = (idx: number, dir: -1 | 1) => setItems((s) => {
    const next = [...s]; const j = idx + dir;
    if (j < 0 || j >= next.length) return s;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    return next;
  });

  const payload = JSON.stringify(items.map(({ category, description, quantity, unit_price, tax_rate }) => ({ category, description, quantity, unit_price, tax_rate: tax_rate || "0" })));

  return (
    <ActionForm action={saveQuotationAction} className="space-y-6">
      {({ errors }) => (
        <>
          {quotationId && <input type="hidden" name="id" value={quotationId} />}
          <input type="hidden" name="enquiry_id" value={enquiry.id} />
          <input type="hidden" name="items" value={payload} />
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Quotation title" htmlFor="title" error={errors.title} required className="md:col-span-2">
              <Input id="title" name="title" defaultValue={initial.title} />
            </Field>
            <Field label="Issue date" htmlFor="issue_date" error={errors.issue_date} required><Input id="issue_date" name="issue_date" type="date" defaultValue={initial.issue_date} /></Field>
            <Field label="Valid until" htmlFor="valid_until" error={errors.valid_until} required><Input id="valid_until" name="valid_until" type="date" defaultValue={initial.valid_until} /></Field>
          </div>

          <div className="rounded-md border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
              <h2 className="text-sm font-semibold">Cost breakdown</h2>
              <p className="text-xs text-muted-foreground">{enquiry.travellers} traveller(s) · {enquiry.nights} night(s) · {enquiry.rooms} room(s)</p>
            </div>
            {errors.items && <p className="px-3 pt-2 text-xs text-danger">{errors.items}</p>}
            <div className="divide-y">
              {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No line items yet. Add transport, stay, meals and other costs below.</p>}
              {items.map((item, idx) => {
                const line = preview.lines[idx];
                const err = (f: string) => errors[`items.${idx}.${f}`];
                return (
                  <div key={item.key} className="grid grid-cols-12 items-start gap-2 px-3 py-3" data-testid="quotation-line">
                    <div className="col-span-12 sm:col-span-3">
                      <label className="sr-only" htmlFor={`cat-${item.key}`}>Category</label>
                      <Select id={`cat-${item.key}`} value={item.category} onChange={(e) => update(item.key, { category: e.target.value as QuotationItemCategory })}>
                        {QUOTATION_ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                      </Select>
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <label className="sr-only" htmlFor={`desc-${item.key}`}>Description</label>
                      <Input id={`desc-${item.key}`} placeholder="Description" value={item.description} aria-invalid={err("description") ? true : undefined} onChange={(e) => update(item.key, { description: e.target.value })} />
                      {err("description") && <p className="mt-1 text-xs text-danger">{err("description")}</p>}
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <label className="sr-only" htmlFor={`qty-${item.key}`}>Quantity</label>
                      <Input id={`qty-${item.key}`} inputMode="decimal" placeholder="Qty" value={item.quantity} aria-invalid={err("quantity") ? true : undefined} onChange={(e) => update(item.key, { quantity: e.target.value })} />
                    </div>
                    <div className="col-span-5 sm:col-span-2">
                      <label className="sr-only" htmlFor={`price-${item.key}`}>Unit price</label>
                      <Input id={`price-${item.key}`} inputMode="decimal" placeholder="Unit price" value={item.unit_price} aria-invalid={err("unit_price") ? true : undefined} onChange={(e) => update(item.key, { unit_price: e.target.value })} />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <label className="sr-only" htmlFor={`tax-${item.key}`}>Tax %</label>
                      <Input id={`tax-${item.key}`} inputMode="decimal" placeholder="Tax %" value={item.tax_rate} onChange={(e) => update(item.key, { tax_rate: e.target.value })} />
                    </div>
                    <div className="col-span-12 flex items-center justify-between gap-1 sm:col-span-1 sm:flex-col sm:items-end">
                      <span className="text-sm font-medium tabular" data-testid="line-total">{line ? formatMoney(line.total.toFixed(2), cur) : "—"}</span>
                      <span className="flex">
                        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => move(idx, -1)} aria-label="Move line up"><ArrowUp className="size-3.5" /></button>
                        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => move(idx, 1)} aria-label="Move line down"><ArrowDown className="size-3.5" /></button>
                        <button type="button" className="rounded p-1 text-danger hover:bg-danger-soft" onClick={() => setItems((s) => s.filter((x) => x.key !== item.key))} aria-label="Remove line"><Trash2 className="size-3.5" /></button>
                      </span>
                    </div>
                    {(err("quantity") || err("unit_price") || err("tax_rate")) && <p className="col-span-12 text-xs text-danger">{err("quantity") ?? err("unit_price") ?? err("tax_rate")}</p>}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 border-t px-3 py-2.5">
              <Button size="sm" variant="outline" onClick={() => add()}><Plus />Add line item</Button>
              {(["transportation", "meals", "activities", "guide"] as const).map((c) => (
                <Button key={c} size="sm" variant="ghost" onClick={() => add(c)}>+ {CATEGORY_LABELS[c]}</Button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Discount" htmlFor="discount_type">
                  <Select id="discount_type" name="discount_type" value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
                    <option value="none">No discount</option><option value="fixed">Fixed amount</option><option value="percent">Percentage</option>
                  </Select>
                </Field>
                <Field label={discountType === "percent" ? "Discount %" : `Amount (${cur})`} htmlFor="discount_value" error={errors.discount_value ?? preview.discountError ?? (preview.overAgentLimit ? `Above your ${agentDiscountLimit}% approval limit.` : undefined)}>
                  <Input id="discount_value" name="discount_value" inputMode="decimal" disabled={discountType === "none"} value={discountType === "none" ? "0" : discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
                </Field>
              </div>
              <Field label="Payment terms" htmlFor="payment_terms" error={errors.payment_terms}><Textarea id="payment_terms" name="payment_terms" rows={2} defaultValue={initial.payment_terms} /></Field>
              <Field label="Terms and conditions" htmlFor="terms" error={errors.terms}><Textarea id="terms" name="terms" rows={4} defaultValue={initial.terms} /></Field>
              <Field label="Internal notes" htmlFor="internal_notes" hint="Not shown on the PDF." error={errors.internal_notes}><Textarea id="internal_notes" name="internal_notes" rows={2} defaultValue={initial.internal_notes} /></Field>
            </div>
            <div className="h-fit rounded-md border bg-muted/30 p-4" aria-live="polite">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular" data-testid="preview-subtotal">{formatMoney(preview.subtotal.toFixed(2), cur)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Taxes</dt><dd className="tabular" data-testid="preview-tax">{formatMoney(preview.tax.toFixed(2), cur)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular" data-testid="preview-discount">− {formatMoney(preview.discount.toFixed(2), cur)}</dd></div>
                <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Grand total</dt><dd className="tabular" data-testid="preview-total">{formatMoney(preview.grand.toFixed(2), cur)}</dd></div>
              </dl>
              <div className="mt-4 space-y-1.5 border-t pt-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Customer budget</span><span className="tabular">{enquiry.budget != null ? formatMoney(enquiry.budget, cur) : "Not given"}</span></div>
                {diff && <div className="flex items-center justify-between"><span className="text-muted-foreground">Difference</span><span className={`tabular ${diff.lt(0) ? "text-danger" : "text-success"}`}>{formatMoney(diff.toFixed(2), cur)}</span></div>}
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Budget status</span><StatusBadge status={status} /></div>
              </div>
              <p className="mt-3 text-[11.5px] text-muted-foreground">Preview only. Totals are recalculated on the server when you save. Discounts apply to the pre-tax subtotal.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="outline"><Link href={quotationId ? `/quotations/${quotationId}` : `/enquiries/${enquiry.id}`}>Cancel</Link></Button>
            <SubmitButton pendingLabel="Saving…">Save draft</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
