import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { loadFonts, pdfMoney, sanitizeLatin1, splitRuns } from "@/lib/pdf/layout";
import { renderQuotationPdf } from "@/lib/pdf/documents";
import type { Agency, Quotation, QuotationItem } from "@/types/models";

describe("pdf money", () => {
  it("groups INR the Indian way and others the western way, without float maths", () => {
    expect(pdfMoney("12345678.5", "INR")).toBe("INR 1,23,45,678.50");
    expect(pdfMoney("123456", "INR")).toBe("INR 1,23,456.00");
    expect(pdfMoney("999", "INR")).toBe("INR 999.00");
    expect(pdfMoney("12345678.5", "USD")).toBe("USD 12,345,678.50");
    expect(pdfMoney("999999999999.99", "EUR")).toBe("EUR 999,999,999,999.99");
    expect(pdfMoney("-10.005", "USD")).toBe("-USD 10.01");
  });
});

describe("pdf font runs", () => {
  it("routes Devanagari to the fallback font and replaces unsupported characters", async () => {
    const fonts = await loadFonts();
    expect(fonts).not.toBeNull();
    const runs = splitRuns("Shreyas श्रेयस ₹10 Kamat 中", fonts!.primary, fonts!.deva);
    expect(runs.map((r) => r.face)).toEqual(["primary", "deva", "primary"]);
    expect(runs.map((r) => r.text).join("")).toBe("Shreyas श्रेयस ₹10 Kamat ?");
  });

  it("keeps a WinAnsi-only fallback when fonts are unavailable", () => {
    expect(sanitizeLatin1("José ₹5 Ж")).toBe("José INR 5 ?");
  });
});

describe("quotation PDF with international text", () => {
  it("embeds the Unicode fonts and renders customer names in several scripts", async () => {
    const agency = { name: "Yātrā Tours Pvt. Ltd.", address: "12 Łódź Street", city: "Pune", country: "India", phone: "+91 98765 43210", email: "hello@yatra.example", tax_id: "27ABCDE1234F1Z5" } as unknown as Agency;
    const q = {
      quotation_code: "QUO-000042", title: "Hà Nội & Αθήνα — family trip", status: "sent", issue_date: "2026-11-01", valid_until: "2026-11-15",
      currency: "INR", subtotal: "123456.00", tax_amount: "6172.80", discount_amount: "0.00", discount_type: "none", discount_value: "0", grand_total: "129628.80",
      terms: "Prices in ₹. Cancellation: 25% after confirmation.", payment_terms: "50% advance", internal_notes: null,
      customer: { full_name: "श्रेयस कामत / Nguyễn Thị Hằng / Владимир", phone: "+91 90000 00000", email: "s@example.com", address: "Ærøskøbing 7", city: "İstanbul", country: "Türkiye", customer_code: "CUS-000007" },
      enquiry: { adults: 2, children: 1, infants: 0, rooms: 1, source_location: "München", destination: "Kraków", departure_date: "2026-12-01", return_date: "2026-12-07" },
    } as unknown as Quotation;
    const items = [{ description: "Hôtel Château — 6 nuits", category: "accommodation", quantity: "6", unit_price: "20576.00", tax_rate: "5", line_total: "129628.80" }] as unknown as QuotationItem[];
    const bytes = await renderQuotationPdf(agency, q, items);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    const fontNames = Array.from(new Set(doc.context.enumerateIndirectObjects()
      .map(([, obj]) => String((obj as { get?: (k: unknown) => unknown }).get?.call(obj, (doc.context.obj("BaseFont") as never)) ?? ""))
      .filter((n) => n.includes("DejaVu") || n.includes("Noto"))));
    expect(fontNames.some((n) => n.includes("DejaVuSans"))).toBe(true);
    expect(fontNames.some((n) => n.includes("NotoSansDevanagari"))).toBe(true);
    expect(bytes.length).toBeLessThan(250_000); // subsets, not whole font files
    const out = process.env.PDF_SAMPLE_OUT;
    if (out) fs.writeFileSync(path.resolve(out), bytes);
  });
});
