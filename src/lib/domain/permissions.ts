// Role capabilities used by the UI and server actions. The database (RLS + triggers) enforces the
// same rules independently; these checks exist to fail early with a clear message and to hide
// actions a user cannot perform.

export const ROLES = ["owner", "admin", "agent"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { owner: "Owner", admin: "Administrator", agent: "Travel agent" };

export type Capability =
  | "agency.manage"
  | "team.view"
  | "team.manage_agents"
  | "team.manage_admins"
  | "customers.archive"
  | "records.reassign"
  | "records.view_all"
  | "quotations.review"
  | "quotations.discount_unlimited"
  | "bookings.cancel"
  | "bookings.edit_dates_after_confirmation"
  | "payments.view"
  | "payments.record"
  | "payments.refund"
  | "reports.financial"
  | "reports.operational";

const MATRIX: Record<Role, readonly Capability[]> = {
  owner: [
    "agency.manage", "team.view", "team.manage_agents", "team.manage_admins", "customers.archive", "records.reassign",
    "records.view_all", "quotations.review", "quotations.discount_unlimited", "bookings.cancel",
    "bookings.edit_dates_after_confirmation", "payments.view", "payments.record", "payments.refund",
    "reports.financial", "reports.operational",
  ],
  admin: [
    "team.view", "team.manage_agents", "customers.archive", "records.reassign", "records.view_all", "quotations.review",
    "quotations.discount_unlimited", "bookings.cancel", "bookings.edit_dates_after_confirmation", "payments.view",
    "payments.record", "reports.operational",
  ],
  agent: ["reports.operational"],
};

export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[role].includes(capability);
}

/** Which roles an actor may assign when inviting or editing a member. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "owner") return ["owner", "admin", "agent"];
  if (actor === "admin") return ["agent"];
  return [];
}

export function canManageMember(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target === "agent";
  return false;
}
