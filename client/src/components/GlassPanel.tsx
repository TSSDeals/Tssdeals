import { cn } from "@/lib/utils";

export function GlassPanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-white/10 bg-white/60 shadow-xl shadow-black/5 backdrop-blur-xl",
        "dark:bg-white/5 dark:border-white/10",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.55] [background:radial-gradient(800px_300px_at_20%_0%,hsl(var(--primary)/0.20),transparent_55%),radial-gradient(700px_260px_at_80%_0%,hsl(var(--accent)/0.18),transparent_50%)]" />
      <div className="relative">{children}</div>
    </div>
  );
}
