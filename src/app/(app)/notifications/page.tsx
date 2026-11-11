import Link from "next/link";
import { Bell } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { listNotifications } from "@/features/notifications/queries";
import { markNotificationsReadAction } from "@/features/notifications/actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireSession();
  const items = await listNotifications(ctx, 100);
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <>
      <PageHeader title="Notifications" description="Assignments, approvals, confirmations and upcoming departures." crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Notifications" }]}
        actions={unread > 0 && <ActionForm action={markNotificationsReadAction}><SubmitButton variant="outline" size="sm">Mark all as read</SubmitButton></ActionForm>} />
      <Card>
        {items.length === 0 ? <EmptyState icon={Bell} title="You're all caught up" description="Notifications about your enquiries, quotations and bookings will appear here." /> : (
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id} className={cn("flex items-start gap-3 px-5 py-3.5", !n.read_at && "bg-accent/40")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-secondary")} aria-hidden />
                <div className="min-w-0 flex-1">
                  {n.link ? <Link href={n.link} className="text-sm font-medium hover:underline">{n.title}</Link> : <p className="text-sm font-medium">{n.title}</p>}
                  {n.body && <p className="text-[13px] text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <ActionForm action={markNotificationsReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <SubmitButton variant="ghost" size="sm">Mark read</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
