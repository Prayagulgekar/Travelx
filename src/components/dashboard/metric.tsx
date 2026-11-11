import Link from "next/link";
import { cn } from "@/lib/utils";

export function Metric({ label, value, definition, href, tone }: { label: string; value: React.ReactNode; definition: string; href?: string; tone?: "warning" | "danger" | "success" }) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular tracking-tight", tone === "warning" && "text-warning", tone === "danger" && "text-danger", tone === "success" && "text-success")}>{value}</p>
      <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{definition}</p>
    </>
  );
  const cls = "block rounded-lg border bg-card px-4 py-3.5 shadow-card";
  return href ? <Link href={href} className={cn(cls, "transition-colors hover:border-secondary/40")}>{body}</Link> : <div className={cls}>{body}</div>;
}
