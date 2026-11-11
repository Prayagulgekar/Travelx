import Link from "next/link";
import { LoginForm } from "@/components/auth/forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; confirm?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-lg font-semibold">Sign in to TravelX</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">Use the email your agency registered you with.</p>
      {sp.confirm && <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">Confirm your email address using the link we sent, then sign in.</p>}
      {sp.error && <p className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">That link is invalid or has expired. Please try again.</p>}
      <LoginForm next={sp.next} />
      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        New agency? <Link href="/signup" className="font-medium text-secondary hover:underline">Create a workspace</Link>
      </p>
    </>
  );
}
