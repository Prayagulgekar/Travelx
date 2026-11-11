"use client";
import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { signOutAction } from "@/features/auth/actions";

export function AccountMenu({ name, email, roleLabel, initials }: { name: string; email: string; roleLabel: string; initials: string }) {
  return (
    <DropdownMenu>
      <DropdownTrigger className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
        <span className="hidden text-left md:block">
          <span className="block max-w-[160px] truncate text-[13px] font-medium leading-tight">{name || email}</span>
          <span className="block text-[11px] leading-tight text-muted-foreground">{roleLabel}</span>
        </span>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>
          <span className="block truncate font-medium text-foreground">{name || "Your account"}</span>
          <span className="block truncate">{email}</span>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem asChild><Link href="/profile"><UserRound /> Profile</Link></DropdownItem>
        <DropdownItem asChild>
          <form action={signOutAction} className="w-full">
            <button type="submit" className="flex w-full items-center gap-2"><LogOut className="size-4" /> Sign out</button>
          </form>
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}
