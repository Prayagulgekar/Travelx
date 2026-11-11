import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <Link href="/dashboard" className="mt-3 inline-block text-sm text-secondary hover:underline">Go to TravelX</Link>
      </div>
    </main>
  );
}
