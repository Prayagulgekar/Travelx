import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({ page, pageSize, total, basePath, params }: { page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); });
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const linkCls = "inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-[13px] hover:bg-muted";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-[13px] text-muted-foreground">
      <span className="tabular">Showing {from}–{to} of {total}</span>
      <div className="flex items-center gap-2">
        {page > 1 ? <Link className={linkCls} href={href(page - 1)}><ChevronLeft className="size-3.5" />Previous</Link>
          : <span className={cn(linkCls, "pointer-events-none opacity-50")} aria-disabled><ChevronLeft className="size-3.5" />Previous</span>}
        <span className="tabular">Page {page} of {pages}</span>
        {page < pages ? <Link className={linkCls} href={href(page + 1)}>Next<ChevronRight className="size-3.5" /></Link>
          : <span className={cn(linkCls, "pointer-events-none opacity-50")} aria-disabled>Next<ChevronRight className="size-3.5" /></span>}
      </div>
    </div>
  );
}
