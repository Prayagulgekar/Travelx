"use client";
import * as React from "react";
import { Copy } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { ROLE_LABELS, type Role } from "@/lib/domain/permissions";
import { inviteMemberAction, updateMemberAction } from "@/features/team/actions";
import { useToast } from "@/components/ui/toast";

export function InviteMemberDialog({ roles }: { roles: Role[] }) {
  const [open, setOpen] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const toast = useToast();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLink(null); }}>
      <DialogTrigger asChild><Button>Invite member</Button></DialogTrigger>
      <DialogContent title="Invite a team member" description="They will choose their own password using a one-time invitation link.">
        {link ? (
          <div className="space-y-3">
            <p className="text-sm">Share this one-time link with the new member. It can be used once and expires after your Supabase email link lifetime (1 hour by default). If it expires, invite the same email again for a new link.</p>
            <div className="flex gap-2"><Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(link); toast.success("Link copied."); }}><Copy />Copy</Button></div>
            <div className="flex justify-end"><Button onClick={() => { setOpen(false); setLink(null); }}>Done</Button></div>
          </div>
        ) : (
          <ActionForm action={inviteMemberAction} onSuccess={(r) => { const url = r.ok ? (r.data?.inviteUrl as string | null | undefined) : null; if (url) setLink(url); else setOpen(false); }} className="space-y-4">
            {({ errors }) => (
              <>
                <Field label="Full name" htmlFor="inv-name" error={errors.full_name} required><Input id="inv-name" name="full_name" /></Field>
                <Field label="Email" htmlFor="inv-email" error={errors.email} required><Input id="inv-email" name="email" type="email" /></Field>
                <Field label="Role" htmlFor="inv-role" error={errors.role}>
                  <Select id="inv-role" name="role" defaultValue="agent">{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
                </Field>
                <div className="flex justify-end"><SubmitButton pendingLabel="Inviting…">Create invitation</SubmitButton></div>
              </>
            )}
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function MemberEditor({ id, role, status, roles }: { id: string; role: Role; status: string; roles: Role[] }) {
  return (
    <ActionForm action={updateMemberAction} className="flex flex-wrap items-center gap-2">
      {() => (
        <>
          <input type="hidden" name="id" value={id} />
          <label className="sr-only" htmlFor={`role-${id}`}>Role</label>
          <Select id={`role-${id}`} name="role" defaultValue={role} className="h-8 w-40 text-[13px]">{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
          <label className="sr-only" htmlFor={`status-${id}`}>Status</label>
          <Select id={`status-${id}`} name="status" defaultValue={status === "suspended" ? "suspended" : "active"} className="h-8 w-32 text-[13px]"><option value="active">Active</option><option value="suspended">Suspended</option></Select>
          <SubmitButton size="sm" variant="outline">Save</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
