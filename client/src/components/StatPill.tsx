import { cn } from "@/lib/utils";

export function StatPill({
  label,
  value,
  tone = "neutral",
  className,
  "data-testid": dataTestId,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "accent";
  className?: string;
  "data-testid"?: string;
}) {
  const toneClasses =
    tone === "primary"
      ? "border-primary/20 bg-primary/10 text-primary"
      : tone === "accent"
        ? "border-accent/20 bg-accent/10 text-accent"
        : "border-border bg-muted text-foreground/80";

  return (
    <div
      data-testid={dataTestId}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide",
        toneClasses,
        className,
      )}
    >
      <span className="opacity-70">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
