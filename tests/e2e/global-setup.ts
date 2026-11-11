import fs from "node:fs";
import path from "node:path";
import { admin, createAgency, createCustomer, PASSWORD, stackAvailable } from "../integration/helpers";

export const SEED_FILE = path.resolve(__dirname, "../../.localstack/e2e-seed.json");

export interface E2ESeed {
  password: string;
  ownerEmail: string;
  adminEmail: string;
  agentEmail: string;
  otherAgencyCustomerId: string;
  otherAgencyOwnerEmail: string;
}

async function emailOf(id: string) {
  const { data, error } = await admin().auth.admin.getUserById(id);
  if (error || !data.user?.email) throw error ?? new Error("no email");
  return data.user.email;
}

export default async function globalSetup() {
  if (!stackAvailable) throw new Error("Local stack not running: start it with `npm run db:test-stack` first.");
  const a = await createAgency("E2E");
  const b = await createAgency("Other");
  const foreign = await createCustomer(b.owner, { full_name: "Foreign Customer" });
  const seed: E2ESeed = {
    password: PASSWORD,
    ownerEmail: await emailOf(a.ownerId),
    adminEmail: await emailOf(a.adminId),
    agentEmail: await emailOf(a.agentId),
    otherAgencyCustomerId: foreign.id as string,
    otherAgencyOwnerEmail: await emailOf(b.ownerId),
  };
  fs.writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
}
