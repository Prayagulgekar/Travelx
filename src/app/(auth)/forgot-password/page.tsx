import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forms";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">We&apos;ll email you a secure link to choose a new password.</p>
      <ForgotPasswordForm />
      <p className="mt-5 text-center text-[13px]"><Link href="/login" className="text-secondary hover:underline">Back to sign in</Link></p>
    </>
  );
}
