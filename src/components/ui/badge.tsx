import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/domain/status";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-info-soft text-info ring-info/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-danger ring-danger/20",
  primary: "bg-accent text-accent-foreground ring-secondary/20",
};

const STATUS_TONES: Record<string, Tone> = {
  new: "info", contacted: "primary", requirements_pending: "warning", quotation_in_progress: "primary", quotation_sent: "info",
  converted: "success", lost: "neutral", cancelled: "danger",
  draft: "neutral", reviewed: "primary", sent: "info", accepted: "success", rejected: "danger", expired: "warning",
  pending_confirmation: "warning", confirmed: "success", in_progress: "info", completed: "neutral",
  pending: "warning", received: "success", failed: "danger", refunded: "neutral", partially_refunded: "warning",
  within_budget: "success", at_budget_limit: "warning", exceeds_budget: "danger", no_budget: "neutral",
  low: "neutral", medium: "primary", high: "warning", urgent: "danger",
  active: "success", suspended: "danger", invited: "warning",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

const EXTRA_LABELS: Record<string, string> = {
  within_budget: "Within budget", at_budget_limit: "At budget limit", exceeds_budget: "Exceeds budget", no_budget: "No budget given",
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent", active: "Active", suspended: "Suspended", invited: "Invited",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"} className={className}>{EXTRA_LABELS[status] ?? statusLabel(status)}</Badge>;
}
