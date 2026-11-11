import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { initials } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/lib/domain/permissions";
import { MobileNav, type NavItem } from "./sidebar";
import { AccountMenu } from "./account-menu";

export function Topbar({ items, agencyName, userName, email, role, unread }: { items: NavItem[]; agencyName: string; userName: string; email: string; role: Role; unread: number }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur md:px-6">
      <MobileNav items={items} agencyName={agencyName} />
      <form action="/search" method="get" role="search" className="relative max-w-md flex-1">
        <label htmlFor="global-search" className="sr-only">Search customers, enquiries, quotations and bookings</label>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input id="global-search" name="q" type="search" placeholder="Search name, phone, ENQ/QUO/BKG number, destination"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </form>
      <div className="ml-auto flex items-center gap-1.5">
        <Link href="/notifications" className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span data-testid="unread-count" className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white tabular">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        <AccountMenu name={userName} email={email} roleLabel={ROLE_LABELS[role]} initials={initials(userName || email)} />
      </div>
    </header>
  );
}
