import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMagicLink } from "@/components/MagicLinkDialog";
import { useReturnTracking } from "@/hooks/use-return-tracking";
import {
  Bell,
  BookOpen,
  Camera,
  Compass,
  Construction,
  GraduationCap,
  LogOut,
  Mail,
  Monitor,
  Settings2,
  Share,
  Shield,
  Smartphone,
  Trophy,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

function initials(name?: string | null, email?: string | null) {
  const base = (name?.trim() || email?.trim() || "User").split(" ");
  const a = base[0]?.[0] ?? "U";
  const b = base.length > 1 ? base[base.length - 1]?.[0] : "";
  return (a + b).toUpperCase();
}

function detectPlatform(): "ios" | "android" | "desktop" {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function InstallBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("tss-install-dismissed") === "1"; } catch { return false; }
  });

  if (dismissed || isStandalone()) return null;

  const platform = detectPlatform();

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem("tss-install-dismissed", "1"); } catch {}
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 p-4 shadow-sm" data-testid="install-banner">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <div className="text-xs font-bold">Install the App</div>
        </div>
        <button
          onClick={dismiss}
          className="rounded-lg p-1 hover:bg-muted transition-colors"
          data-testid="install-banner-dismiss"
          type="button"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {platform === "ios" ? (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">iPhone / iPad:</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Tap the <span className="inline-flex items-center gap-1 font-semibold text-foreground"><Share className="inline h-3 w-3" /> Share</span> button in Safari</li>
            <li>Scroll down and tap <span className="font-semibold text-foreground">Add to Home Screen</span></li>
            <li>Tap <span className="font-semibold text-foreground">Add</span> to confirm</li>
          </ol>
          <p className="text-[10px] text-muted-foreground/70">Opening from your Home Screen enables push notifications.</p>
        </div>
      ) : platform === "android" ? (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Android:</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Tap the <span className="font-semibold text-foreground">3-dot menu</span> (top right) in Chrome</li>
            <li>Tap <span className="font-semibold text-foreground">Add to Home screen</span> or <span className="font-semibold text-foreground">Install app</span></li>
            <li>Tap <span className="font-semibold text-foreground">Install</span> to confirm</li>
          </ol>
          <p className="text-[10px] text-muted-foreground/70">The app will appear on your Home Screen like a regular app.</p>
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Desktop (Chrome / Edge):</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Look for the <span className="inline-flex items-center gap-1 font-semibold text-foreground"><Monitor className="inline h-3 w-3" /> Install</span> icon in the address bar</li>
            <li>Click <span className="font-semibold text-foreground">Install</span> in the prompt</li>
          </ol>
          <p className="text-[10px] text-muted-foreground/70">The app opens in its own window with push notification support.</p>
        </div>
      )}
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  rightSlot,
  children,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  const [location] = useLocation();
  const { user, isLoading, logout, isLoggingOut } = useAuth();
  const { openDialog } = useMagicLink();
  useReturnTracking();
  const pagesRef = useRef(0);
  const sessionIdRef = useRef<string>("");

  useEffect(() => {
    const now = Date.now();
    const lastBeat = Number(sessionStorage.getItem("_tssd_ts") || "0");
    if (!sessionIdRef.current || (now - lastBeat > 1800000)) {
      sessionIdRef.current = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem("_tssd_sid", sessionIdRef.current);
      pagesRef.current = 0;
    }
    if (!sessionIdRef.current) {
      sessionIdRef.current = sessionStorage.getItem("_tssd_sid") || `${now}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem("_tssd_sid", sessionIdRef.current);
    }
    pagesRef.current += 1;
    const send = () => {
      sessionStorage.setItem("_tssd_ts", String(Date.now()));
      fetch("/api/visits/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, pagesViewed: pagesRef.current }),
      }).catch(() => {});
    };
    send();
    const iv = setInterval(send, 60000);
    return () => clearInterval(iv);
  }, [location]);

  const displayName = useMemo(() => {
    const u: any = user as any;
    const full = [u?.firstName, u?.lastName].filter(Boolean).join(" ");
    return full || u?.email || "Signed-in";
  }, [user]);

  const isAdmin = (user as any)?.isAdmin === true;
  const isGuest = !isLoading && !user;

  const nav = [
    { href: "/app/deals", label: "Deals", icon: Compass },
    { href: "/app/top-deals", label: "Top Deals", icon: Trophy },
    { href: "/guides", label: "Buyer's Guide", icon: GraduationCap },
    { href: "/app/blog", label: "Blog & Reviews", icon: BookOpen },
    ...(!isGuest ? [{ href: "/app/preferences", label: "Preferences", icon: Settings2 }] : []),
    ...(!isGuest ? [{ href: "/app/notifications", label: "Notifications", icon: Bell }] : []),
    ...(isAdmin ? [{ href: "/app/admin", label: "Admin", icon: Shield }] : []),
  ];

  return (
    <div className="relative min-h-screen bg-mesh grain">
      <div className="relative z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-[280px_1fr] lg:gap-8">
            {/* Sidebar */}
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="card-elevated overflow-hidden">
                <div className="relative p-5">
                  <div className="pointer-events-none absolute inset-0 opacity-80 [background:radial-gradient(680px_240px_at_20%_0%,hsl(var(--primary)/0.16),transparent_60%),radial-gradient(540px_220px_at_100%_0%,hsl(var(--accent)/0.14),transparent_55%)]" />
                  <div className="relative flex justify-center">
                    <Link href="/" data-testid="link-logo-home">
                      <img
                        src="/images/tss-logo.jpeg"
                        alt="TwinSeam Deals"
                        className="h-28 w-28 rounded-2xl object-cover shadow-md hover:opacity-90 transition-opacity"
                        data-testid="img-tss-logo-sidebar"
                      />
                    </Link>
                  </div>

                  {isGuest ? (
                    <div className="mt-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <div className="text-sm font-bold" data-testid="user-name">Get Deal Alerts by Email or Text</div>
                      </div>
                      <div className="text-xs text-muted-foreground mb-3">
                        Save preferences & get notified when prices drop on the gear you want.
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openDialog("email")}
                        className="w-full ring-focus rounded-xl text-xs bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20"
                        data-testid="login-button"
                      >
                        <Mail className="mr-1.5 h-3.5 w-3.5" />
                        Register with Email
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openDialog("phone")}
                        className="mt-2 w-full ring-focus rounded-xl text-xs bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20"
                        data-testid="login-phone-button"
                      >
                        <Smartphone className="mr-1.5 h-3.5 w-3.5" />
                        Register with Text
                      </Button>
                      <Link href="/notifications" data-testid="sms-alerts-button">
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full ring-focus rounded-xl text-xs"
                        >
                          <Smartphone className="mr-1.5 h-3.5 w-3.5" />
                          Sign Up for SMS Alerts
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-background/60 p-3 shadow-sm">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={(user as any)?.profileImageUrl ?? ""} alt={displayName} />
                        <AvatarFallback className="bg-muted text-xs font-bold">
                          {initials((user as any)?.firstName, (user as any)?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold" data-testid="user-name">
                          {isLoading ? "Loading…" : displayName}
                        </div>
                        <div className="truncate text-xs text-muted-foreground" data-testid="user-email">
                          {(user as any)?.email ?? " "}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => logout()}
                        disabled={isLoggingOut}
                        className="ring-focus rounded-xl hover:bg-muted"
                        data-testid="logout"
                        title="Log out"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <nav className="p-2">
                  {nav.map((item) => {
                    const active = location === item.href || (item.href !== "/app/deals" && location.startsWith(item.href));
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                          "hover:bg-muted hover:shadow-sm",
                          active
                            ? "bg-gradient-to-r from-primary/12 to-accent/10 text-foreground shadow-sm"
                            : "text-foreground/80",
                        )}
                        data-testid={`nav-${item.label.toLowerCase()}`}
                      >
                        <span
                          className={cn(
                            "grid h-9 w-9 place-items-center rounded-2xl border transition-all duration-200",
                            active
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : "border-border bg-background/60 text-muted-foreground group-hover:text-primary",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full transition-opacity",
                            active ? "bg-primary opacity-100" : "bg-border opacity-0 group-hover:opacity-100",
                          )}
                        />
                      </Link>
                    );
                  })}
                </nav>

                <div className="p-4 pt-2 space-y-3">
                  <div className="rounded-2xl border border-border bg-gradient-to-br from-background/70 to-background p-4 shadow-sm">
                    <div className="text-xs font-semibold text-muted-foreground">Update schedule (ET)</div>
                    <div className="mt-2 text-sm font-semibold">8am · 12pm · 4pm · 8pm</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Fresh drops, four times daily.
                    </div>
                  </div>
                  <InstallBanner />
                </div>
              </div>
            </aside>

            {/* Content */}
            <main className="min-w-0">
              <header className="card-elevated mb-6 overflow-hidden">
                <div className="relative p-5 md:p-6">
                  <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(900px_320px_at_10%_-10%,hsl(var(--primary)/0.18),transparent_60%),radial-gradient(700px_260px_at_90%_-20%,hsl(var(--accent)/0.14),transparent_55%)]" />
                  <div className="relative flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="min-w-0">
                      <h1 className="font-display text-2xl font-bold leading-tight md:text-3xl">
                        {title}
                      </h1>
                      {subtitle ? (
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground md:text-base">
                          {subtitle}
                        </p>
                      ) : null}
                    </div>
                    {rightSlot ? <div className="flex shrink-0 items-center gap-2">{rightSlot}</div> : null}
                  </div>
                </div>
              </header>

              <div className="space-y-6">{children}</div>
            </main>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/30 p-4 shadow-sm" data-testid="dev-banner">
            <div className="flex items-start gap-3">
              <Construction className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-sm text-amber-900 dark:text-amber-200">
                <p className="mt-1 text-amber-800 dark:text-amber-300">
                  We are continually making improvements to this website. Please contact us at{" "}
                  <a
                    href="mailto:tssdeals@twinseamsports.com"
                    className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
                    data-testid="link-feedback-email"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    tssdeals@twinseamsports.com
                  </a>{" "}
                  with any questions or comments.
                </p>
              </div>
            </div>
          </div>
        </div>

        <footer className="pb-10 pt-4">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="soft-divider h-px w-full" />
            <div className="mt-6 flex flex-col gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-4 flex-wrap">
                <Link href="/guides" className="hover:text-foreground transition-colors">Buyer's Guide</Link>
                <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
                <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
                <Link href="/notifications" className="hover:text-foreground transition-colors">SMS Alerts</Link>
                <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                <Link href="/disclaimer" className="hover:text-foreground transition-colors">Disclaimer</Link>
              </div>
              <div className="space-y-0.5">
                <div>© {new Date().getFullYear()} TSSDeals / Twin Seam Sports</div>
                <div>Maryville, TN</div>
                <a href="mailto:tssdeals@twinseamsports.com" className="hover:text-foreground transition-colors">tssdeals@twinseamsports.com</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
