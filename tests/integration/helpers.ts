import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Integration tests run against an ISOLATED local stack (scripts/local-stack/start.sh or `supabase start`).
// They create their own agencies with random emails and never touch production data.

function loadEnv(): Record<string, string> {
  const file = path.resolve(__dirname, "../../.localstack/env");
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !out[m[1]!]) out[m[1]!] = m[2]!;
    }
  }
  return out;
}

const env = loadEnv();
export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const TEST_DATABASE_URL = env.TEST_DATABASE_URL ?? "";
export const stackAvailable = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY) && !/supabase\.co/.test(SUPABASE_URL);

export const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
export const anon = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export const PASSWORD = "Passw0rd-test-123";

export function isoDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function signIn(email: string): Promise<SupabaseClient> {
  const c = anon();
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

export interface TestAgency {
  agencyId: string;
  owner: SupabaseClient; ownerId: string;
  admin: SupabaseClient; adminId: string;
  agent: SupabaseClient; agentId: string;
  agent2: SupabaseClient; agent2Id: string;
}

async function createUser(email: string, meta: Record<string, string>) {
  const { data, error } = await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: meta });
  if (error || !data.user) throw error ?? new Error("user not created");
  return data.user.id;
}

/** Creates an agency (owner via self sign-up trigger) plus an admin and two agents. */
export async function createAgency(label: string): Promise<TestAgency> {
  const tag = `${label}-${randomUUID().slice(0, 8)}`;
  const ownerEmail = `owner-${tag}@test.local`;
  const ownerId = await createUser(ownerEmail, { full_name: `Owner ${label}`, agency_name: `Agency ${tag}` });
  const sa = admin();
  const { data: m, error } = await sa.from("agency_members").select("agency_id").eq("user_id", ownerId).single();
  if (error) throw error;
  const agencyId = m.agency_id as string;
  const member = async (role: "admin" | "agent", name: string) => {
    const email = `${role}-${name}-${tag}@test.local`;
    const id = await createUser(email, { full_name: `${name} ${label}` });
    const ins = await sa.from("agency_members").insert({ agency_id: agencyId, user_id: id, role, status: "active" });
    if (ins.error) throw ins.error;
    return { id, client: await signIn(email) };
  };
  const a = await member("admin", "Admin");
  const g1 = await member("agent", "AgentOne");
  const g2 = await member("agent", "AgentTwo");
  return { agencyId, owner: await signIn(ownerEmail), ownerId, admin: a.client, adminId: a.id, agent: g1.client, agentId: g1.id, agent2: g2.client, agent2Id: g2.id };
}

let phoneCounter = Math.floor(Math.random() * 1_000_000);
export function uniquePhone(): string {
  phoneCounter += 1;
  return `+91 98${String(phoneCounter).padStart(8, "0")}`;
}

export async function createCustomer(c: SupabaseClient, overrides: Record<string, unknown> = {}) {
  const { data, error } = await c.from("customers").insert({ full_name: "Asha Rao", phone: uniquePhone(), email: null, ...overrides }).select("*").single();
  if (error) throw error;
  return data as { id: string; customer_code: string; agency_id: string };
}

export async function createEnquiry(c: SupabaseClient, customerId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await c.from("enquiries").insert({
    customer_id: customerId, source_location: "Mumbai", destination: "Bali", departure_date: isoDay(10), return_date: isoDay(15),
    adults: 2, children: 1, infants: 0, rooms: 1, budget: "150000.00", ...overrides,
  }).select("*").single();
  if (error) throw error;
  return data as { id: string; enquiry_code: string; status: string; assigned_to: string | null };
}

export const ITEMS = [
  { category: "accommodation", description: "Hotel, 5 nights", quantity: "5", unit_price: "8000.00", tax_rate: "12" },
  { category: "transportation", description: "Return flights", quantity: "3", unit_price: "18500.50", tax_rate: "5" },
  { category: "activities", description: "Snorkelling trip", quantity: "3", unit_price: "2999.99", tax_rate: "18" },
];

export async function createQuotation(c: SupabaseClient, enquiryId: string, opts: { items?: unknown[]; discount_type?: string; discount_value?: string } = {}) {
  const { data, error } = await c.rpc("save_quotation", {
    p_quotation_id: null,
    p_header: { enquiry_id: enquiryId, title: "Bali family holiday", issue_date: isoDay(0), valid_until: isoDay(14), discount_type: opts.discount_type ?? "none", discount_value: opts.discount_value ?? "0" },
    p_items: opts.items ?? ITEMS,
  });
  if (error) throw error;
  return data as string;
}

export async function setQuotationStatus(c: SupabaseClient, id: string, status: string) {
  return c.from("quotations").update({ status }).eq("id", id).select("id, status");
}

/** Owner takes a quotation to accepted and converts it; returns booking id. */
export async function acceptedBooking(t: TestAgency, enquiryId: string, maker: SupabaseClient = t.agent) {
  const qid = await createQuotation(maker, enquiryId);
  for (const s of ["reviewed", "sent", "accepted"]) {
    const r = await setQuotationStatus(t.owner, qid, s);
    if (r.error) throw r.error;
  }
  const { data, error } = await maker.rpc("convert_quotation_to_booking", { p_quotation_id: qid, p_notes: null });
  if (error) throw error;
  return { quotationId: qid, bookingId: data as string };
}

/** Direct SQL for time-travel style test setup only (bypasses triggers). Never used by the app. */
export async function sqlBypassingTriggers(text: string, params: unknown[] = []) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query("set session_replication_role = replica");
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}
