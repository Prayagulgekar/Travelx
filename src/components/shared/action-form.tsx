"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/errors";

const PendingContext = React.createContext(false);

export type FormAction = (prev: ActionResult<ActionPayload> | null, formData: FormData) => Promise<ActionResult<ActionPayload>>;
export interface ActionPayload { redirectTo?: string; [key: string]: unknown }

interface ActionFormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "children"> {
  action: FormAction;
  children: React.ReactNode | ((state: { errors: Record<string, string>; pending: boolean }) => React.ReactNode);
  onSuccess?: (result: ActionResult<ActionPayload>) => void;
  resetOnSuccess?: boolean;
}

/**
 * Form wired to a server action. Shows toasts for results, field-level errors, redirects when the
 * action returns `redirectTo`, and refreshes server data otherwise. The submit button is disabled
 * while pending, which prevents double submissions from double clicks.
 */
export function ActionForm({ action, children, onSuccess, resetOnSuccess, ...props }: ActionFormProps) {
  const [state, formAction, pending] = React.useActionState(action, null);
  const toast = useToast();
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const handled = React.useRef<typeof state>(null);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (state.message) toast.success(state.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (state.data?.redirectTo) router.push(state.data.redirectTo);
      else router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, toast, router, onSuccess, resetOnSuccess]);

  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  // Submitting via onSubmit + startTransition (instead of <form action>) keeps what the user typed
  // when validation fails; React's built-in form actions reset uncontrolled fields after submit.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    React.startTransition(() => formAction(fd));
  };
  return (
    <PendingContext.Provider value={pending}>
      <form ref={formRef} onSubmit={onSubmit} noValidate {...props}>
        {typeof children === "function" ? children({ errors, pending }) : children}
      </form>
    </PendingContext.Provider>
  );
}

export function SubmitButton({ children, pendingLabel, ...props }: ButtonProps & { pendingLabel?: string }) {
  const formStatus = useFormStatus();
  const pending = React.useContext(PendingContext) || formStatus.pending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
