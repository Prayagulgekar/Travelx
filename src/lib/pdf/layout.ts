import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
// fontkit's complex-script shapers (used for Devanagari) expect a global regeneratorRuntime.
import "regenerator-runtime/runtime";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { money } from "@/lib/domain/money";

// Small layout engine on top of pdf-lib: text wrapping, automatic page breaks, simple tables.
// Fonts: DejaVu Sans (Latin incl. extended/Vietnamese, Greek, Cyrillic, currency symbols) with Noto Sans
// Devanagari as a per-character fallback, both embedded as subsets. Text is split into runs by font
// coverage. If the font files cannot be read, the writer falls back to Helvetica with WinAnsi-only text.

export const COLORS = {
  navy: rgb(0.075, 0.137, 0.29),
  blue: rgb(0.067, 0.369, 0.776),
  text: rgb(0.13, 0.15, 0.2),
  muted: rgb(0.42, 0.45, 0.5),
  line: rgb(0.86, 0.88, 0.91),
  soft: rgb(0.955, 0.965, 0.98),
};

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 48;

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONT_FILES = {
  regular: "DejaVuSans.ttf",
  bold: "DejaVuSans-Bold.ttf",
  devaRegular: "NotoSansDevanagari-Regular.ttf",
  devaBold: "NotoSansDevanagari-Bold.ttf",
} as const;

interface FontData { bytes: Record<keyof typeof FONT_FILES, Uint8Array>; primary: Set<number>; deva: Set<number> }
let fontData: Promise<FontData | null> | null = null;

function codepoints(bytes: Uint8Array): Set<number> {
  const f = fontkit.create(Buffer.from(bytes)) as unknown as { characterSet: number[] };
  return new Set(f.characterSet);
}

/** Reads the font files once per server instance. Null (with a logged error) if they are missing. */
export function loadFonts(): Promise<FontData | null> {
  fontData ??= (async () => {
    try {
      const entries = await Promise.all(
        (Object.keys(FONT_FILES) as (keyof typeof FONT_FILES)[]).map(async (k) => [k, new Uint8Array(await fs.readFile(path.join(FONT_DIR, FONT_FILES[k])))] as const),
      );
      const bytes = Object.fromEntries(entries) as FontData["bytes"];
      return { bytes, primary: codepoints(bytes.regular), deva: codepoints(bytes.devaRegular) };
    } catch (error) {
      console.error("[pdf] embedded fonts unavailable, falling back to Helvetica", error instanceof Error ? error.message : error);
      fontData = null;
      return null;
    }
  })();
  return fontData;
}

/** WinAnsi-only cleanup used when the embedded fonts are unavailable. */
export function sanitizeLatin1(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/₹/g, "INR ").replace(/\t/g, "  ")
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, "?");
}

type Face = "primary" | "deva";
interface Run { text: string; face: Face }

/**
 * Splits text into runs per font. Characters neither font covers become "?"; control characters are
 * dropped; whitespace and punctuation stay in the current run to avoid needless font switches.
 */
export function splitRuns(text: string, primary: Set<number>, deva: Set<number>): Run[] {
  const runs: Run[] = [];
  for (const ch of text.normalize("NFC").replace(/\t/g, "  ")) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) continue;
    const inP = primary.has(cp);
    const inD = deva.has(cp);
    const last = runs[runs.length - 1];
    let face: Face;
    let out = ch;
    if (inP && inD && last && !/\p{L}/u.test(ch)) face = last.face; // neutral: space, digits, punctuation, ₹
    else if (inP) face = "primary";
    else if (inD) face = "deva";
    else { face = last?.face ?? "primary"; out = "?"; }
    if (last && last.face === face) last.text += out;
    else runs.push({ text: out, face });
  }
  return runs;
}

export class PdfWriter {
  doc!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  private devaFont: PDFFont | null = null;
  private devaBold: PDFFont | null = null;
  private coverage: { primary: Set<number>; deva: Set<number> } | null = null;
  y = 0;
  readonly left = MARGIN;
  readonly right = PAGE_W - MARGIN;
  readonly width = PAGE_W - MARGIN * 2;
  private footer = "";

  static async create(footer: string): Promise<PdfWriter> {
    const w = new PdfWriter();
    w.doc = await PDFDocument.create();
    const fonts = await loadFonts();
    if (fonts) {
      w.doc.registerFontkit(fontkit);
      w.font = await w.doc.embedFont(fonts.bytes.regular, { subset: true });
      w.bold = await w.doc.embedFont(fonts.bytes.bold, { subset: true });
      w.devaFont = await w.doc.embedFont(fonts.bytes.devaRegular, { subset: true });
      w.devaBold = await w.doc.embedFont(fonts.bytes.devaBold, { subset: true });
      w.coverage = { primary: fonts.primary, deva: fonts.deva };
    } else {
      w.font = await w.doc.embedFont(StandardFonts.Helvetica);
      w.bold = await w.doc.embedFont(StandardFonts.HelveticaBold);
    }
    w.footer = footer;
    w.addPage();
    return w;
  }

  private runs(text: string, bold: boolean): { text: string; font: PDFFont }[] {
    if (!this.coverage) return [{ text: sanitizeLatin1(text), font: bold ? this.bold : this.font }];
    return splitRuns(text, this.coverage.primary, this.coverage.deva).map((r) => ({
      text: r.text,
      font: r.face === "deva" ? ((bold ? this.devaBold : this.devaFont) ?? this.font) : bold ? this.bold : this.font,
    }));
  }

  /** Width of text in points, across font runs. */
  measure(text: string, size: number, bold = false): number {
    return this.runs(text, bold).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);
  }

  /** Draws text starting at x, switching fonts per run. */
  draw(text: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; page?: PDFPage } = {}) {
    const page = opts.page ?? this.page;
    let cx = x;
    for (const r of this.runs(text, opts.bold ?? false)) {
      if (!r.text) continue;
      page.drawText(r.text, { x: cx, y, size, font: r.font, color: opts.color ?? COLORS.text });
      cx += r.font.widthOfTextAtSize(r.text, size);
    }
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 24) this.addPage();
  }

  wrap(text: string, size: number, maxWidth: number, bold = false): string[] {
    const lines: string[] = [];
    const width = (t: string) => this.measure(t, size, bold);
    for (const paragraph of (text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) { lines.push(""); continue; }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (width(candidate) <= maxWidth) { line = candidate; continue; }
        if (line) lines.push(line);
        // hard-break very long words
        let chars = Array.from(word);
        while (width(chars.join("")) > maxWidth && chars.length > 1) {
          let cut = chars.length - 1;
          while (cut > 1 && width(chars.slice(0, cut).join("")) > maxWidth) cut--;
          lines.push(chars.slice(0, cut).join(""));
          chars = chars.slice(cut);
        }
        line = chars.join("");
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; maxWidth?: number; lineGap?: number } = {}) {
    const size = opts.size ?? 10;
    const x = opts.x ?? this.left;
    const lines = this.wrap(text, size, opts.maxWidth ?? this.right - x, opts.bold);
    const lh = size * 1.35 + (opts.lineGap ?? 0);
    for (const line of lines) {
      this.ensure(lh);
      this.draw(line, x, this.y - size, size, { bold: opts.bold, color: opts.color });
      this.y -= lh;
    }
  }

  textRight(text: string, xRight: number, y: number, size = 10, bold = false, color = COLORS.text) {
    this.draw(text, xRight - this.measure(text, size, bold), y, size, { bold, color });
  }

  gap(h: number) { this.y -= h; }

  rule(color = COLORS.line) {
    this.ensure(8);
    this.page.drawLine({ start: { x: this.left, y: this.y }, end: { x: this.right, y: this.y }, thickness: 0.75, color });
    this.y -= 8;
  }

  sectionTitle(title: string) {
    this.ensure(30);
    this.gap(6);
    this.text(title.toUpperCase(), { size: 8.5, bold: true, color: COLORS.blue });
    this.gap(2);
  }

  /** Brand header block with agency details on the right. */
  header(docTitle: string, agencyLines: string[]) {
    this.page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: COLORS.navy });
    const top = this.y;
    this.draw("TravelX", this.left, top - 20, 20, { bold: true, color: COLORS.navy });
    this.draw(docTitle, this.left, top - 38, 11, { color: COLORS.muted });
    let ry = top - 10;
    agencyLines.filter(Boolean).forEach((l, i) => {
      this.textRight(l, this.right, ry, i === 0 ? 10.5 : 8.5, i === 0, i === 0 ? COLORS.text : COLORS.muted);
      ry -= i === 0 ? 14 : 11;
    });
    this.y = Math.min(top - 50, ry - 4);
    this.rule();
    this.gap(4);
  }

  /** Two-column key/value grid. */
  keyValues(pairs: [string, string][], columns = 2) {
    const colW = this.width / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      const row = pairs.slice(i, i + columns);
      const heights = row.map(([, v]) => this.wrap(v || "-", 9.5, colW - 12).length);
      const h = 12 + Math.max(...heights) * 12.5 + 6;
      this.ensure(h);
      const startY = this.y;
      row.forEach(([k, v], c) => {
        const x = this.left + c * colW;
        this.draw(k, x, startY - 8, 7.5, { color: COLORS.muted });
        this.wrap(v || "-", 9.5, colW - 12).forEach((line, li) => {
          this.draw(line, x, startY - 21 - li * 12.5, 9.5);
        });
      });
      this.y = startY - h;
    }
  }

  /** Table with right-aligned numeric columns; repeats the header after page breaks. */
  table(columns: { label: string; width: number; align?: "left" | "right" }[], rows: string[][]) {
    const totalW = columns.reduce((a, c) => a + c.width, 0);
    const widths = columns.map((c) => (c.width / totalW) * this.width);
    const drawHeader = () => {
      this.ensure(22);
      this.page.drawRectangle({ x: this.left, y: this.y - 18, width: this.width, height: 18, color: COLORS.soft });
      let x = this.left;
      columns.forEach((c, i) => {
        const w = widths[i] ?? 0;
        if (c.align === "right") this.textRight(c.label, x + w - 6, this.y - 12.5, 8, true, COLORS.muted);
        else this.draw(c.label, x + 6, this.y - 12.5, 8, { bold: true, color: COLORS.muted });
        x += w;
      });
      this.y -= 22;
    };
    drawHeader();
    for (const row of rows) {
      const wrapped = row.map((cell, i) => this.wrap(cell, 9, (widths[i] ?? 0) - 12));
      const h = Math.max(...wrapped.map((l) => l.length)) * 12 + 8;
      if (this.y - h < MARGIN + 24) { this.addPage(); drawHeader(); }
      let x = this.left;
      wrapped.forEach((lines, i) => {
        const w = widths[i] ?? 0;
        lines.forEach((line, li) => {
          const ly = this.y - 10 - li * 12;
          if (columns[i]?.align === "right") this.textRight(line, x + w - 6, ly, 9);
          else this.draw(line, x + 6, ly, 9);
        });
        x += w;
      });
      this.y -= h;
      this.page.drawLine({ start: { x: this.left, y: this.y + 2 }, end: { x: this.right, y: this.y + 2 }, thickness: 0.5, color: COLORS.line });
    }
  }

  /** Right-aligned totals block. */
  totals(rows: { label: string; value: string; strong?: boolean }[]) {
    const labelX = this.right - 230;
    for (const r of rows) {
      this.ensure(r.strong ? 26 : 16);
      if (r.strong) {
        this.page.drawRectangle({ x: labelX - 8, y: this.y - 20, width: this.right - labelX + 8, height: 22, color: COLORS.navy });
        this.draw(r.label, labelX, this.y - 14, 10, { bold: true, color: rgb(1, 1, 1) });
        this.textRight(r.value, this.right - 6, this.y - 14, 10.5, true, rgb(1, 1, 1));
        this.y -= 26;
      } else {
        this.draw(r.label, labelX, this.y - 10, 9.5, { color: COLORS.muted });
        this.textRight(r.value, this.right - 6, this.y - 10, 9.5);
        this.y -= 16;
      }
    }
  }

  async finish(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      this.draw(this.footer, this.left, 24, 7.5, { color: COLORS.muted, page: p });
      const label = `Page ${i + 1} of ${pages.length}`;
      this.draw(label, this.right - this.measure(label, 7.5), 24, 7.5, { color: COLORS.muted, page: p });
    });
    this.doc.setProducer("TravelX");
    this.doc.setCreator("TravelX");
    return this.doc.save();
  }
}

export function pdfMoney(value: string | number, currency: string): string {
  // Decimal-safe; Indian digit grouping for INR (matches the app), western grouping otherwise.
  const fixed = money(value).toFixed(2);
  const negative = fixed.startsWith("-");
  const [int = "0", dec = "00"] = fixed.replace("-", "").split(".");
  const grouped = currency === "INR"
    ? int.replace(/(\d)(?=(\d\d)+\d$)/g, "$1,")
    : int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${currency} ${grouped}.${dec}`;
}

export function pdfDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
