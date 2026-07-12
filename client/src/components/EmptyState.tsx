import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  "data-testid": dataTestId,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={dataTestId}
      className={cn(
        "card-elevated relative overflow-hidden p-6 md:p-8",
        "before:pointer-events-none before:absolute before:inset-0 before:opacity-70 before:[background:radial-gradient(800px_240px_at_15%_0%,hsl(var(--primary)/0.12),transparent_55%),radial-gradient(700px_220px_at_90%_0%,hsl(var(--accent)/0.10),transparent_60%)]",
        className,
      )}
    >
      <div className="relative flex flex-col items-start gap-3">
        <div className="rounded-2xl border border-border bg-background/60 p-3 shadow-sm">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold">{title}</h3>
          {description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}
