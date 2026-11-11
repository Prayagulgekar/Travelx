"use client";
import Link from "next/link";
import * as React from "react";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { changePasswordAction, loginAction, requestPasswordResetAction, setNewPasswordAction, signupAction } from "@/features/auth/actions";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} className="space-y-4">
      {({ errors }) => (
        <>
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password}>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-[13px] text-secondary hover:underline">Forgot password?</Link>
          </div>
          <SubmitButton className="w-full" pendingLabel="Signing in…">Sign in</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "THB", "LKR", "NPR"];

export function SignupForm() {
  return (
    <ActionForm action={signupAction} className="space-y-4">
      {({ errors }) => (
        <>
          <Field label="Your name" htmlFor="full_name" error={errors.full_name} required>
            <Input id="full_name" name="full_name" autoComplete="name" required />
          </Field>
          <Field label="Agency name" htmlFor="agency_name" error={errors.agency_name} required>
            <Input id="agency_name" name="agency_name" autoComplete="organization" required />
          </Field>
          <Field label="Work email" htmlFor="email" error={errors.email} required>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password} hint="At least 10 characters, with letters and a number." required>
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </Field>
          <Field label="Agency currency" htmlFor="currency" error={errors.currency}>
            <Select id="currency" name="currency" defaultValue="INR">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <SubmitButton className="w-full" pendingLabel="Creating workspace…">Create agency workspace</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);
  if (sent) {
    return <p className="rounded-md bg-success-soft px-3 py-2.5 text-sm text-success">If an account exists for that email, a reset link is on its way. The link expires after one hour.</p>;
  }
  return (
    <ActionForm action={requestPasswordResetAction} onSuccess={() => setSent(true)} className="space-y-4">
      {({ errors }) => (
        <>
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </Field>
          <SubmitButton className="w-full" pendingLabel="Sending…">Send reset link</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function NewPasswordForm() {
  return (
    <ActionForm action={setNewPasswordAction} className="space-y-4">
      {({ errors }) => (
        <>
          <Field label="New password" htmlFor="password" error={errors.password} hint="At least 10 characters, with letters and a number.">
            <Input id="password" name="password" type="password" autoComplete="new-password" required autoFocus />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={errors.confirm}>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
          <SubmitButton className="w-full" pendingLabel="Saving…">Set password</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePasswordAction} className="space-y-4">
      {({ errors }) => (
        <>
          <Field label="Current password" htmlFor="current_password" error={errors.current_password}>
            <Input id="current_password" name="current_password" type="password" autoComplete="current-password" required autoFocus />
          </Field>
          <Field label="New password" htmlFor="password" error={errors.password} hint="At least 10 characters, with letters and a number.">
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm}>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
          <SubmitButton className="w-full" pendingLabel="Saving…">Change password</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
