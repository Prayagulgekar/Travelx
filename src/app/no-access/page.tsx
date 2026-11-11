import { redirect } from "next/navigation";
import { getMembershipState } from "@/lib/auth";
import { Logo } from "@/components/layout/logo";
import { signOutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "No workspace access" };

export default async function NoAccessPage() {
  const state = await getMembershipState();
  if (state.kind === "anonymous") redirect("/login");
  if (state.kind === "ok") redirect("/dashboard");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-6"><Logo /></div>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-card">
        <h1 className="text-base font-semibold">{state.status === "suspended" ? "Your access has been suspended" : "You're not part of an agency workspace"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as {state.email}. {state.status === "suspended" ? "Contact your agency owner to restore access." : "Ask your agency owner to invite you, or sign out and create a new workspace."}
        </p>
        <form action={signOutAction} className="mt-5"><Button type="submit" variant="outline">Sign out</Button></form>
      </div>
    </div>
  );
}
