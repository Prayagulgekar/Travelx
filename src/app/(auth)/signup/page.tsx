import Link from "next/link";
import { SignupForm } from "@/components/auth/forms";

export const metadata = { title: "Create workspace" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Create your agency workspace</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">You&apos;ll be the owner. Invite your team from the Team page afterwards.</p>
      <SignupForm />
      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        Already using TravelX? <Link href="/login" className="font-medium text-secondary hover:underline">Sign in</Link>
      </p>
    </>
  );
}
