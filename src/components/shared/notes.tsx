import { formatDateTime } from "@/lib/format";
import type { FormAction } from "./action-form";
import { NoteForm } from "./note-form";
import type { Note } from "@/types/models";

export function NotesPanel({ notes, names, action, hidden }: { notes: Note[]; names: Map<string, string>; action: FormAction; hidden: Record<string, string> }) {
  return (
    <div className="space-y-4">
      <NoteForm action={action} hidden={hidden} />
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md bg-muted/60 px-3 py-2.5">
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{n.author_id ? names.get(n.author_id) ?? "Former member" : "System"} · {formatDateTime(n.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
