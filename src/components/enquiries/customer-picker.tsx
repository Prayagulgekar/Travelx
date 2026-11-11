"use client";
import * as React from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Option { id: string; full_name: string; phone: string; customer_code: string }

/** Server-searched customer combobox: never loads the full customer list into the browser. */
export function CustomerPicker({ name, initial, error, describedBy }: { name: string; initial?: Option | null; error?: string; describedBy?: string }) {
  const [selected, setSelected] = React.useState<Option | null>(initial ?? null);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<Option[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        const body = (await res.json()) as { customers?: Option[] };
        setOptions(body.customers ?? []);
        setActive(0);
      } catch { /* aborted or offline: keep previous options */ }
      finally { setLoading(false); }
    }, 200);
    return () => { ctrl.abort(); window.clearTimeout(t); };
  }, [query, open]);

  const choose = (o: Option) => { setSelected(o); setOpen(false); setQuery(""); };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected && !open ? (
        <div className="flex h-9 items-center justify-between rounded-md border border-input bg-card px-3 text-sm">
          <span className="truncate"><span className="font-medium">{selected.full_name}</span> <span className="text-muted-foreground">· {selected.phone} · {selected.customer_code}</span></span>
          <button type="button" className="text-[13px] text-secondary hover:underline" onClick={() => setOpen(true)}>Change</button>
        </div>
      ) : (
        <Input
          id={name}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          placeholder="Search by name, phone or CUS number"
          value={query}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && open && options[active]) { e.preventDefault(); choose(options[active]); }
            if (e.key === "Escape") setOpen(false);
          }}
        />
      )}
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-card p-1 shadow-pop">
          {loading && options.length === 0 && <li className="px-2.5 py-2 text-sm text-muted-foreground">Searching…</li>}
          {!loading && options.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">No matching customers. <Link href="/customers/new" className="text-secondary hover:underline">Add a customer</Link></li>
          )}
          {options.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active}
              className={cn("cursor-pointer rounded px-2.5 py-1.5 text-sm", i === active && "bg-muted")}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseEnter={() => setActive(i)}>
              <span className="font-medium">{o.full_name}</span> <span className="text-muted-foreground">· {o.phone} · {o.customer_code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
