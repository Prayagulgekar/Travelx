// Prints anon/service JWTs for the local test stack (signed with LOCAL_JWT_SECRET).
import crypto from "node:crypto";
const secret = process.env.LOCAL_JWT_SECRET ?? "travelx-local-test-secret-at-least-32-characters";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (payload) => {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
};
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
console.log(`ANON_KEY=${sign({ role: "anon", iss: "supabase", exp })}`);
console.log(`SERVICE_KEY=${sign({ role: "service_role", iss: "supabase", exp })}`);
