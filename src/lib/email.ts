import "server-only";
import { serverEnv } from "@/lib/env";

// Transactional email boundary. Only Resend is implemented; any provider can be added by
// implementing EmailProvider. When no provider is configured, getEmailProvider() returns null
// and the UI shows email sending as unavailable — nothing is ever reported as sent.

export interface EmailAttachment { filename: string; content: Uint8Array }
export interface EmailMessage { to: string; subject: string; html: string; text: string; replyTo?: string; attachments?: EmailAttachment[] }
export type SendResult = { ok: true; providerId: string } | { ok: false; error: string };

export interface EmailProvider { name: string; send(message: EmailMessage): Promise<SendResult> }

class ResendProvider implements EmailProvider {
  name = "Resend";
  constructor(private apiKey: string, private from: string) {}
  async send(m: EmailMessage): Promise<SendResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: this.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, reply_to: m.replyTo,
          attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok || !body.id) return { ok: false, error: body.message ?? `Email provider returned ${res.status}.` };
      return { ok: true, providerId: body.id };
    } catch {
      return { ok: false, error: "The email provider could not be reached." };
    }
  }
}

export function getEmailProvider(): EmailProvider | null {
  const { resendApiKey, emailFrom } = serverEnv();
  if (!resendApiKey || !emailFrom) return null;
  return new ResendProvider(resendApiKey, emailFrom);
}

export function isEmailConfigured(): boolean {
  const { resendApiKey, emailFrom } = serverEnv();
  return Boolean(resendApiKey && emailFrom);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
