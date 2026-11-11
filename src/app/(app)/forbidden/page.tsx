import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata = { title: "Access restricted" };

export default function Forbidden() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-8 text-center shadow-card">
      <ShieldAlert className="mx-auto mb-3 size-6 text-danger" aria-hidden />
      <h1 className="text-base font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your role does not include this area. Ask your agency owner if you need access.</p>
      <Link href="/dashboard" className="mt-5 inline-block text-sm font-medium text-secondary hover:underline">Back to dashboard</Link>
    </div>
  );
}
