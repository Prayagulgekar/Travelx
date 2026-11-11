import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

export interface FilterSelect { name: string; label: string; options: { value: string; label: string }[]; value?: string }

/** GET form so filters live in the URL (shareable, back-button friendly, server-side filtered). */
export function FilterBar({ basePath, search, searchPlaceholder, selects = [], dates }: {
  basePath: string;
  search?: string;
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  dates?: { from?: string; to?: string; label?: string };
}) {
  const active = Boolean(search || selects.some((s) => s.value) || dates?.from || dates?.to);
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-2 border-b px-4 py-3" role="search">
      <div className="relative min-w-[200px] flex-1">
        <label htmlFor="filter-q" className="sr-only">Search</label>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input id="filter-q" name="q" defaultValue={search} placeholder={searchPlaceholder ?? "Search"} className="pl-8" />
      </div>
      {selects.map((s) => (
        <div key={s.name} className="w-full sm:w-auto">
          <label htmlFor={`filter-${s.name}`} className="sr-only">{s.label}</label>
          <Select id={`filter-${s.name}`} name={s.name} defaultValue={s.value ?? ""} className="sm:w-44">
            <option value="">{s.label}: all</option>
            {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
      ))}
      {dates && (
        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor="filter-from" className="text-xs text-muted-foreground">{dates.label ?? "From"}</label>
          <Input id="filter-from" type="date" name="from" defaultValue={dates.from} className="w-[150px] max-w-[42vw]" />
          <label htmlFor="filter-to" className="text-xs text-muted-foreground">to</label>
          <Input id="filter-to" type="date" name="to" defaultValue={dates.to} className="w-[150px] max-w-[42vw]" />
        </div>
      )}
      <Button type="submit" variant="outline">Apply</Button>
      {active && <Link href={basePath} className="px-2 text-[13px] text-secondary hover:underline">Clear</Link>}
    </form>
  );
}
