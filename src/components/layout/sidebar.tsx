"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  BarChart3, CalendarRange, CreditCard, FileText, Inbox, LayoutDashboard, Map, Menu, Settings, Users, UserSquare2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

export interface NavItem { href: string; label: string; icon: keyof typeof ICONS }

const ICONS = {
  dashboard: LayoutDashboard, enquiries: Inbox, customers: UserSquare2, quotations: FileText, itineraries: Map,
  bookings: CalendarRange, payments: CreditCard, reports: BarChart3, team: Users, settings: Settings,
};

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                active ? "bg-sidebar-active text-white" : "text-sidebar-muted hover:bg-sidebar-active/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({ items, agencyName }: { items: NavItem[]; agencyName: string }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar lg:flex">
      <div className="flex h-14 items-center px-4"><Logo inverted /></div>
      <p className="truncate px-4 pb-3 text-xs text-sidebar-muted" title={agencyName}>{agencyName}</p>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2.5 pb-4"><NavLinks items={items} /></nav>
    </aside>
  );
}

export function MobileNav({ items, agencyName }: { items: NavItem[]; agencyName: string }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button type="button" className="rounded-md p-2 text-foreground hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}>
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo inverted />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-sidebar-muted hover:text-white" aria-label="Close navigation"><X className="size-5" /></button>
            </div>
            <p className="truncate px-4 pb-3 text-xs text-sidebar-muted">{agencyName}</p>
            <nav className="flex-1 overflow-y-auto px-2.5 pb-4"><NavLinks items={items} onNavigate={() => setOpen(false)} /></nav>
          </div>
        </div>
      )}
    </>
  );
}
