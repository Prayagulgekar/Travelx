import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-8 text-center shadow-card">
      <SearchX className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
      <h1 className="text-base font-semibold">Record not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">It may have been removed, or it belongs to a workspace you don&apos;t have access to.</p>
      <Link href="/dashboard" className="mt-5 inline-block text-sm font-medium text-secondary hover:underline">Back to dashboard</Link>
    </div>
  );
}
