import { requireCapability } from "@/lib/auth";
import { assignableRoles, canManageMember, ROLE_LABELS } from "@/lib/domain/permissions";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { InviteMemberDialog, MemberEditor } from "@/components/team/team-forms";
import { getTeam, memberName } from "@/features/team/queries";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireCapability("team.view");
  const team = await getTeam(ctx);
  const roles = assignableRoles(ctx.role);
  return (
    <>
      <PageHeader title="Team" description="People who can sign in to this agency workspace." crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Team" }]}
        actions={<InviteMemberDialog roles={roles} />} />
      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Table>
            <THead><tr><TH>Member</TH><TH>Role</TH><TH>Status</TH><TH className="hidden md:table-cell">Joined</TH><TH>Manage</TH></tr></THead>
            <TBody>
              {team.map((m) => (
                <TR key={m.id}>
                  <TD><div className="font-medium">{memberName(m)}{m.user_id === ctx.userId && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</div><div className="text-xs text-muted-foreground">{m.profile?.email}</div></TD>
                  <TD>{ROLE_LABELS[m.role]}</TD>
                  <TD><StatusBadge status={m.status} /></TD>
                  <TD className="hidden md:table-cell">{formatDate(m.created_at)}</TD>
                  <TD>{m.user_id !== ctx.userId && canManageMember(ctx.role, m.role) ? <MemberEditor id={m.id} role={m.role} status={m.status} roles={roles} /> : <span className="text-xs text-muted-foreground">—</span>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Role permissions" />
          <CardBody className="space-y-3 text-[13px]">
            <div><p className="font-medium">Owner</p><p className="text-muted-foreground">Everything, including agency settings, financial reports, refunds and managing administrators.</p></div>
            <div><p className="font-medium">Administrator</p><p className="text-muted-foreground">All customers, enquiries, quotations, bookings and payments. Reviews quotations, cancels bookings and manages travel agents.</p></div>
            <div><p className="font-medium">Travel agent</p><p className="text-muted-foreground">Creates customers and enquiries, prepares quotations and works on assigned bookings. No access to payments; discounts limited to {String(ctx.agency.max_agent_discount_percent)}%.</p></div>
            <p className="text-xs text-muted-foreground">Suspended members cannot sign in to the workspace. Their past work stays attributed to them.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
