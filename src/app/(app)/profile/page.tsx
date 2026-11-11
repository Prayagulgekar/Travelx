import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailList } from "@/components/shared/detail-list";
import { ProfileForm } from "@/components/settings/settings-forms";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const ctx = await requireSession();
  return (
    <>
      <PageHeader title="Your profile" crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Profile" }]} />
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Card><CardHeader title="Personal details" /><CardBody><ProfileForm profile={ctx.profile} /></CardBody></Card>
        <Card className="h-fit"><CardHeader title="Account" /><CardBody className="space-y-4">
          <DetailList columns={1} items={[{ label: "Email", value: ctx.email }, { label: "Role", value: ROLE_LABELS[ctx.role] }, { label: "Agency", value: ctx.agency.name }]} />
          <Link href="/reset-password" className="text-sm text-secondary hover:underline">Change password</Link>
        </CardBody></Card>
      </div>
    </>
  );
}
