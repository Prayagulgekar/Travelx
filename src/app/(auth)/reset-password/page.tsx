import { redirect } from "next/navigation";
import { createClient, isPasswordLinkSession } from "@/lib/supabase/server";
import { ChangePasswordForm, NewPasswordForm } from "@/components/auth/forms";

export const metadata = { title: "Choose a password" };

/**
 * Two modes:
 *  - session opened from a password-reset or invitation link (last hour): choose a new password;
 *  - any other signed-in session: change password, which requires the current password.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=link");
  if (await isPasswordLinkSession(supabase, user)) {
    return (
      <>
        <h1 className="text-lg font-semibold">Choose a password</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Signed in as {user.email}.</p>
        <NewPasswordForm />
      </>
    );
  }
  return (
    <>
      <h1 className="text-lg font-semibold">Change password</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">Signed in as {user.email}. Other devices will be signed out.</p>
      <ChangePasswordForm />
    </>
  );
}
