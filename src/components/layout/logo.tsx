export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="7" fill={inverted ? "#ffffff" : "#13234a"} />
        <path d="M9 10h14M16 10v13M11 23l10-8" stroke={inverted ? "#13234a" : "#ffffff"} strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span className={`text-[17px] font-semibold tracking-tight ${inverted ? "text-white" : "text-primary"}`}>TravelX</span>
    </span>
  );
}
