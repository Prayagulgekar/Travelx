"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ className, align = "end", ...props }: M.DropdownMenuContentProps) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-48 rounded-md border bg-card p-1 shadow-pop", className)} {...props} />
    </M.Portal>
  );
}
export function DropdownItem({ className, ...props }: M.DropdownMenuItemProps) {
  return <M.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-muted [&_svg]:size-4", className)} {...props} />;
}
export function DropdownLabel({ className, ...props }: M.DropdownMenuLabelProps) {
  return <M.Label className={cn("px-2.5 py-1.5 text-xs text-muted-foreground", className)} {...props} />;
}
export const DropdownSeparator = () => <M.Separator className="my-1 h-px bg-border" />;
