"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, Clock, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { addActivityAction, moveActivityAction, removeActivityAction, updateActivityAction, updateDayAction } from "@/features/itineraries/actions";
import { formatDate } from "@/lib/format";
import type { ItineraryActivity, ItineraryDay } from "@/types/models";

function ActivityFields({ a, errors }: { a?: ItineraryActivity; errors: Record<string, string> }) {
  const id = a?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <Field label="Activity" htmlFor={`t-${id}`} error={errors.title} required className="sm:col-span-3"><Input id={`t-${id}`} name="title" defaultValue={a?.title} /></Field>
      <Field label="Location" htmlFor={`l-${id}`} error={errors.location} className="sm:col-span-3"><Input id={`l-${id}`} name="location" defaultValue={a?.location ?? ""} /></Field>
      <Field label="Start time" htmlFor={`s-${id}`} error={errors.start_time} className="sm:col-span-2"><Input id={`s-${id}`} name="start_time" type="time" defaultValue={a?.start_time?.slice(0, 5) ?? ""} /></Field>
      <Field label="Duration (min)" htmlFor={`d-${id}`} error={errors.duration_minutes} className="sm:col-span-2"><Input id={`d-${id}`} name="duration_minutes" inputMode="numeric" defaultValue={a?.duration_minutes ?? ""} /></Field>
      <Field label="Description" htmlFor={`x-${id}`} error={errors.description} className="sm:col-span-6"><Textarea id={`x-${id}`} name="description" rows={2} defaultValue={a?.description ?? ""} /></Field>
      <Field label="Notes" htmlFor={`n-${id}`} error={errors.notes} className="sm:col-span-6"><Input id={`n-${id}`} name="notes" defaultValue={a?.notes ?? ""} /></Field>
    </div>
  );
}

function ActivityRow({ a, first, last, editable }: { a: ItineraryActivity; first: boolean; last: boolean; editable: boolean }) {
  const [editing, setEditing] = React.useState(false);
  if (editing) {
    return (
      <ActionForm action={updateActivityAction} onSuccess={() => setEditing(false)} className="space-y-3 rounded-md border bg-muted/30 p-3">
        {({ errors }) => (<><input type="hidden" name="id" value={a.id} /><ActivityFields a={a} errors={errors} />
          <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button><SubmitButton size="sm">Save</SubmitButton></div></>)}
      </ActionForm>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-md border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{a.title}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {a.start_time && <span className="flex items-center gap-1"><Clock className="size-3" />{a.start_time.slice(0, 5)}{a.duration_minutes ? ` · ${a.duration_minutes} min` : ""}</span>}
          {a.location && <span className="flex items-center gap-1"><MapPin className="size-3" />{a.location}</span>}
        </p>
        {a.description && <p className="mt-1 whitespace-pre-wrap text-[13px]">{a.description}</p>}
        {a.notes && <p className="mt-1 text-xs text-muted-foreground">Note: {a.notes}</p>}
      </div>
      {editable && (
        <div className="flex shrink-0 items-center">
          <ActionForm action={moveActivityAction}>{() => (<><input type="hidden" name="id" value={a.id} /><input type="hidden" name="direction" value="up" />
            <button type="submit" disabled={first} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Move activity up"><ArrowUp className="size-3.5" /></button></>)}</ActionForm>
          <ActionForm action={moveActivityAction}>{() => (<><input type="hidden" name="id" value={a.id} /><input type="hidden" name="direction" value="down" />
            <button type="submit" disabled={last} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Move activity down"><ArrowDown className="size-3.5" /></button></>)}</ActionForm>
          <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Edit activity"><Pencil className="size-3.5" /></button>
          <ConfirmAction action={removeActivityAction} hidden={{ id: a.id }} title="Remove activity?" description={`“${a.title}” will be removed from this day.`} confirmLabel="Remove" danger triggerVariant="ghost" triggerSize="sm" triggerLabel={<Trash2 className="size-3.5 text-danger" aria-label="Remove activity" />} />
        </div>
      )}
    </div>
  );
}

export function DayEditor({ day, editable }: { day: ItineraryDay; editable: boolean }) {
  const [adding, setAdding] = React.useState(false);
  const [editingDay, setEditingDay] = React.useState(false);
  return (
    <section className="rounded-lg border bg-card shadow-card" aria-labelledby={`day-${day.id}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 id={`day-${day.id}`} className="text-sm font-semibold">Day {day.day_number}{day.title ? ` · ${day.title}` : ""}</h3>
          <p className="text-xs text-muted-foreground">{formatDate(day.day_date)}</p>
        </div>
        {editable && <Button size="sm" variant="ghost" onClick={() => setEditingDay((v) => !v)}>{editingDay ? "Close" : "Edit day"}</Button>}
      </header>
      <div className="space-y-2.5 p-4">
        {editingDay && (
          <ActionForm action={updateDayAction} onSuccess={() => setEditingDay(false)} className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
            {({ errors }) => (<><input type="hidden" name="id" value={day.id} />
              <Field label="Day title" htmlFor={`dt-${day.id}`} error={errors.title}><Input id={`dt-${day.id}`} name="title" defaultValue={day.title ?? ""} placeholder="e.g. Arrival and city tour" /></Field>
              <Field label="Day notes" htmlFor={`dn-${day.id}`} error={errors.notes}><Input id={`dn-${day.id}`} name="notes" defaultValue={day.notes ?? ""} /></Field>
              <div className="flex justify-end sm:col-span-2"><SubmitButton size="sm">Save day</SubmitButton></div></>)}
          </ActionForm>
        )}
        {day.notes && !editingDay && <p className="text-[13px] text-muted-foreground">{day.notes}</p>}
        {day.activities.length === 0 && !adding && <p className="text-sm text-muted-foreground">No activities planned. Free time / at leisure.</p>}
        {day.activities.map((a, i) => <ActivityRow key={a.id} a={a} first={i === 0} last={i === day.activities.length - 1} editable={editable} />)}
        {editable && (adding ? (
          <ActionForm action={addActivityAction} resetOnSuccess onSuccess={() => setAdding(false)} className="space-y-3 rounded-md border bg-muted/30 p-3">
            {({ errors }) => (<><input type="hidden" name="day_id" value={day.id} /><ActivityFields errors={errors} />
              <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button><SubmitButton size="sm">Add activity</SubmitButton></div></>)}
          </ActionForm>
        ) : <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus />Add activity</Button>)}
      </div>
    </section>
  );
}
