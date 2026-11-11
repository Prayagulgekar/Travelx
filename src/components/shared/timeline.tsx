import { formatDateTime } from "@/lib/format";
import { statusLabel } from "@/lib/domain/status";
import type { ActivityLog } from "@/types/models";

export function ActivityTimeline({ logs, names }: { logs: ActivityLog[]; names: Map<string, string> }) {
  if (logs.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {logs.map((l) => (
        <li key={l.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-card bg-secondary" aria-hidden />
          <p className="text-sm">
            <span className="font-medium">{l.summary}</span>
            {l.old_status && l.new_status && l.old_status !== l.new_status && (
              <span className="text-muted-foreground"> · {statusLabel(l.old_status)} → {statusLabel(l.new_status)}</span>
            )}
          </p>
          {l.changes && typeof l.changes.reason === "string" && <p className="mt-0.5 text-[13px] text-muted-foreground">Reason: {l.changes.reason}</p>}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {l.entity_label ? `${l.entity_label} · ` : ""}{l.actor_id ? names.get(l.actor_id) ?? "Former member" : "System"} · {formatDateTime(l.created_at)}
          </p>
        </li>
      ))}
    </ol>
  );
}
