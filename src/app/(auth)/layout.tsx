import { Logo } from "@/components/layout/logo";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-6"><Logo /></div>
      <div className="w-full max-w-[400px] rounded-lg border bg-card p-6 shadow-card sm:p-7">{children}</div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Operations workspace for travel agencies</p>
    </div>
  );
}
