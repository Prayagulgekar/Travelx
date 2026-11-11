// Dependency-free grouped bar chart rendered on the server as SVG. Used only where there is a
// real time series; values come straight from monthly_performance().
export interface BarSeries { key: string; label: string; color: string }

export function BarChart({ data, series, formatValue, height = 180, ariaLabel }: {
  data: { label: string; values: Record<string, number> }[];
  series: BarSeries[];
  formatValue?: (n: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
  const groupW = 100 / Math.max(1, data.length);
  const barW = (groupW * 0.7) / series.length;
  const fmt = formatValue ?? ((n: number) => String(n));
  return (
    <figure>
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" className="h-[180px] w-full" role="img" aria-label={ariaLabel}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2="100" y1={(height / 3) * (1 - f)} y2={(height / 3) * (1 - f)} stroke="hsl(var(--border))" strokeWidth="0.15" />
        ))}
        {data.map((d, gi) =>
          series.map((s, si) => {
            const v = d.values[s.key] ?? 0;
            const h = (v / max) * (height / 3 - 2);
            const x = gi * groupW + groupW * 0.15 + si * barW;
            return (
              <rect key={`${d.label}-${s.key}`} x={x} y={height / 3 - h} width={barW * 0.9} height={h} fill={s.color} rx="0.4">
                <title>{`${d.label} · ${s.label}: ${fmt(v)}`}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <div className="mt-1 grid text-center text-[11px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((d) => <span key={d.label}>{d.label}</span>)}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
      </figcaption>
    </figure>
  );
}
