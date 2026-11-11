"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-8 text-center shadow-card">
      <AlertTriangle className="mx-auto mb-3 size-6 text-warning" aria-hidden />
      <h1 className="text-base font-semibold">This page could not be loaded</h1>
      <p className="mt-1 text-sm text-muted-foreground">A temporary problem stopped us from loading your data. Your records are safe.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>Go to dashboard</Button>
      </div>
    </div>
  );
}
