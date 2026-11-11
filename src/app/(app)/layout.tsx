import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { Sidebar, type NavItem } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getUnreadCount } from "@/features/notifications/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
  const unread = await getUnreadCount(ctx);
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/enquiries", label: "Enquiries", icon: "enquiries" },
    { href: "/customers", label: "Customers", icon: "customers" },
    { href: "/quotations", label: "Quotations", icon: "quotations" },
    { href: "/itineraries", label: "Itineraries", icon: "itineraries" },
    { href: "/bookings", label: "Bookings", icon: "bookings" },
    ...(can(ctx.role, "payments.view") ? [{ href: "/payments", label: "Payments", icon: "payments" } as NavItem] : []),
    { href: "/reports", label: "Reports", icon: "reports" },
    ...(can(ctx.role, "team.view") ? [{ href: "/team", label: "Team", icon: "team" } as NavItem] : []),
    { href: "/settings", label: "Settings", icon: "settings" },
  ];
  return (
    <div className="flex min-h-screen">
      <Sidebar items={items} agencyName={ctx.agency.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar items={items} agencyName={ctx.agency.name} userName={ctx.profile.full_name} email={ctx.email} role={ctx.role} unread={unread} />
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
