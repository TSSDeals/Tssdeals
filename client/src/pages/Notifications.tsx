import { useEffect, useMemo, useState } from "react";
import Seo from "@/components/Seo";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { redirectToLogin } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import { usePushSendTest, usePushSubscribe, usePushUnsubscribe } from "@/hooks/use-push";
import { useDeals } from "@/hooks/use-deals";
import { Bell, BellOff, Bug, CheckCircle2, ExternalLink, MessageSquare, Settings, Share2, ShieldAlert, Sparkles, Target, TicketX, TrendingDown } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { StatPill } from "@/components/StatPill";
import { Link } from "wouter";

type PushCapability = {
  supported: boolean;
  secureContext: boolean;
  permission: NotificationPermission | "unsupported";
};

export default function NotificationsPage() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToLogin((opts) => toast(opts as any));
    }
  }, [authLoading, isAuthenticated, toast]);

  const sub = usePushSubscribe();
  const unsub = usePushUnsubscribe();
  const test = usePushSendTest();

  const [endpoint, setEndpoint] = useState<string>("");
  const [testDealId, setTestDealId] = useState<string>("");

  const deals = useDeals({ limit: 20, minPercentOff: 50, condition: "all" });

  const smsTest = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sms/test");
      return await res.json();
    },
  });

  const sendSmsTest = async () => {
    try {
      await smsTest.mutateAsync();
      toast({ title: "SMS sent", description: "Check your phone for the test message." });
    } catch (e: any) {
      toast({ title: "SMS test failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  const isIOS = useMemo(() => {
    if (typeof window === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  }, []);

  const isStandalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  }, []);

  const capability: PushCapability = useMemo(() => {
    const supported = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    const secureContext = typeof window !== "undefined" ? window.isSecureContext : false;
    const permission = supported ? Notification.permission : "unsupported";
    return { supported, secureContext, permission };
  }, []);

  const canSubscribe = capability.supported && capability.secureContext && capability.permission !== "denied";

  const requestPermission = async () => {
    try {
      if (!capability.supported) return;
      const perm = await Notification.requestPermission();
      toast({
        title: perm === "granted" ? "Permission granted" : "Permission not granted",
        description:
          perm === "granted"
            ? "Next: tap Subscribe to push below."
            : isIOS && !isStandalone
              ? "On iPhone, add this site to your Home Screen first, then open it from there to enable notifications."
              : "Go to your browser or device Settings → tssdeals.com → Notifications and allow them.",
        variant: perm === "granted" ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Permission error", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  const subscribe = async () => {
    try {
      const subscription = await createBrowserSubscription();
      if (!subscription) {
        toast({
          title: "Not ready to subscribe",
          description: "This requires HTTPS and a service worker with push support.",
          variant: "destructive",
        });
        return;
      }

      const payload = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64Url(subscription.getKey("p256dh")),
          auth: arrayBufferToBase64Url(subscription.getKey("auth")),
        },
      };

      setEndpoint(subscription.endpoint);
      await sub.mutateAsync(payload as any);

      toast({
        title: "Subscribed",
        description: "You’ll receive hot deals on scheduled runs (if enabled in Preferences).",
      });
    } catch (e: any) {
      toast({ title: "Subscribe failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  const unsubscribe = async () => {
    try {
      if (!endpoint) {
        toast({ title: "Endpoint required", description: "Paste the subscription endpoint to unsubscribe.", variant: "destructive" });
        return;
      }
      await unsub.mutateAsync(endpoint);
      toast({ title: "Unsubscribed", description: "Push subscription removed." });
    } catch (e: any) {
      toast({ title: "Unsubscribe failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  const sendTest = async () => {
    try {
      await test.mutateAsync(testDealId.trim() ? testDealId.trim() : undefined);
      toast({ title: "Test sent", description: "A notification should arrive shortly. On iOS, the app must be installed to your home screen." });
    } catch (e: any) {
      const msg: string = e?.message ?? "Unknown error";
      const isNoSub = msg.toLowerCase().includes("subscribe") || msg.toLowerCase().includes("subscription");
      toast({
        title: isNoSub ? "Not subscribed" : "Test failed",
        description: isNoSub
          ? "Your push subscription has expired or was never created. Tap 'Subscribe to push' above, then try again."
          : msg,
        variant: "destructive",
      });
    }
  };

  return (
    <AppShell
      title="Notifications"
      subtitle="Enable browser push and verify your setup. You’ll get hot deals based on Preferences."
      rightSlot={
        <div className="flex flex-wrap items-center gap-2">
          <StatPill
            label="Permission"
            value={String(capability.permission)}
            tone={capability.permission === "granted" ? "primary" : capability.permission === "denied" ? "accent" : "neutral"}
            data-testid="notif-permission"
          />
          <Button
            variant="secondary"
            onClick={requestPermission}
            className="ring-focus rounded-xl"
            data-testid="notif-request-permission"
          >
            <ShieldAlert className="mr-2 h-4 w-4" />
            Request permission
          </Button>
        </div>
      }
    >
      <Seo title="Notifications — TwinSeam Deals" description="Enable browser push notifications and send test alerts." />

      <section className="card-elevated animate-float-in p-5 md:p-6" data-testid="notif-status">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className={cn(
              "grid h-11 w-11 place-items-center rounded-2xl shadow-lg",
              capability.permission === "granted"
                ? "bg-gradient-to-br from-primary to-primary/70 shadow-primary/20"
                : "bg-gradient-to-br from-accent to-accent/70 shadow-accent/20"
            )}>
              {capability.permission === "granted" ? (
                <Bell className="h-5 w-5 text-primary-foreground" />
              ) : (
                <BellOff className="h-5 w-5 text-accent-foreground" />
              )}
            </div>
            <div>
              <div className="font-display text-xl font-bold">Push readiness</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Requires HTTPS, service worker, and backend VAPID support.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <StatPill label="Supported" value={capability.supported ? "Yes" : "No"} tone={capability.supported ? "primary" : "accent"} data-testid="cap-supported" />
            <StatPill label="Secure" value={capability.secureContext ? "Yes" : "No"} tone={capability.secureContext ? "primary" : "accent"} data-testid="cap-secure" />
            <StatPill label="Can subscribe" value={canSubscribe ? "Yes" : "No"} tone={canSubscribe ? "primary" : "accent"} data-testid="cap-cansub" />
          </div>
        </div>

        {isIOS && !isStandalone && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 dark:bg-amber-900">
                <Share2 className="h-4 w-4 text-amber-700 dark:text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm text-amber-900 dark:text-amber-200">iPhone: Add to Home Screen first</div>
                <div className="mt-1 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  Push notifications require iOS 16.4+ and the app installed on your Home Screen. Safari alone cannot send notifications.
                </div>
                <ol className="mt-3 space-y-2 text-xs text-amber-800 dark:text-amber-300">
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-300 dark:bg-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-100 mt-0.5">1</span>
                    <span>Tap the <strong>Share</strong> button ⎙ at the bottom of Safari (the box with an arrow pointing up)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-300 dark:bg-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-100 mt-0.5">2</span>
                    <span>Scroll down and tap <strong>"Add to Home Screen"</strong>, then tap <strong>Add</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-300 dark:bg-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-100 mt-0.5">3</span>
                    <span>Go to your Home Screen and open <strong>"TSS Deals"</strong> (the icon that was just added)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-300 dark:bg-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-100 mt-0.5">4</span>
                    <span>Navigate to <strong>Notifications</strong> in the app and tap <strong>"Request permission"</strong> — iOS will show a popup asking to allow</span>
                  </li>
                </ol>
                <div className="mt-3 rounded-xl bg-amber-100 dark:bg-amber-900/60 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <strong>Already added but can't find it in Settings?</strong> It only appears in Settings → Notifications after you've tapped "Request permission" from the Home Screen version. The app is listed as <strong>"TSS Deals"</strong>.
                </div>
              </div>
            </div>
          </div>
        )}

        {isIOS && isStandalone && capability.permission === "denied" && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-4">
            <div className="font-semibold text-sm text-amber-900 dark:text-amber-200 mb-2">Notifications are blocked — here's how to fix it</div>
            <ol className="space-y-2 text-xs text-amber-800 dark:text-amber-300">
              <li className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-300 dark:bg-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-100 mt-0.5">1</span>
                <span>Open the iPhone <strong>Settings</strong> app (gray gear icon)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-300 dark:bg-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-100 mt-0.5">2</span>
                <span>Tap <strong>Notifications</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-300 dark:bg-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-100 mt-0.5">3</span>
                <span>Scroll to find <strong>"TSS Deals"</strong> in the list and tap it</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-300 dark:bg-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-100 mt-0.5">4</span>
                <span>Toggle <strong>Allow Notifications</strong> on, then return to the app</span>
              </li>
            </ol>
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              If "TSS Deals" doesn't appear, tap "Request permission" below — iOS may prompt you again.
            </div>
          </div>
        )}

        <div className="mt-5 soft-divider h-px w-full" />

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background/60 p-4 shadow-sm">
            <div className="text-sm font-bold">Subscribe</div>
            <div className="mt-1 text-xs text-muted-foreground">
              We’ll create a browser subscription and POST it to the server.
            </div>
            <Button
              onClick={subscribe}
              disabled={!canSubscribe || sub.isPending}
              className={cn(
                "mt-3 w-full ring-focus rounded-xl",
                "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
                "shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
                "active:translate-y-0 active:shadow-md transition-all duration-200 ease-out",
              )}
              data-testid="push-subscribe"
            >
              {sub.isPending ? "Subscribing…" : "Subscribe to push"}
            </Button>

            <div className="mt-3 text-xs text-muted-foreground">
              If this fails, ensure a service worker is registered and the server returns a VAPID public key.
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/60 p-4 shadow-sm">
            <div className="text-sm font-bold">Unsubscribe</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Paste the endpoint you previously subscribed with.
            </div>

            <div className="mt-3 grid gap-2">
              <Label htmlFor="endpoint">Subscription endpoint</Label>
              <Input
                id="endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="ring-focus rounded-xl"
                placeholder="https://fcm.googleapis.com/fcm/send/…"
                data-testid="push-endpoint"
              />
            </div>

            <Button
              variant="secondary"
              onClick={unsubscribe}
              disabled={unsub.isPending}
              className="mt-3 w-full ring-focus rounded-xl"
              data-testid="push-unsubscribe"
            >
              {unsub.isPending ? "Unsubscribing…" : "Unsubscribe"}
            </Button>
          </div>
        </div>
      </section>

      <section className="card-elevated animate-float-in stagger-2 p-5 md:p-6" data-testid="notif-test">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent/70 shadow-lg shadow-accent/20">
            <Bug className="h-5 w-5 text-accent-foreground" />
          </div>
          <div>
            <div className="font-display text-xl font-bold">Send a test notification</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Useful for verifying end-to-end configuration. Optionally attach a dealId.
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="grid gap-2">
            <Label htmlFor="dealId">Deal ID (optional)</Label>
            <Input
              id="dealId"
              value={testDealId}
              onChange={(e) => setTestDealId(e.target.value)}
              className="ring-focus rounded-xl"
              placeholder="Paste a deal id to include"
              data-testid="test-dealId"
            />
            <div className="text-xs text-muted-foreground">
              Quick picks from the feed (50%+ off):
            </div>

            {deals.isError ? (
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="text-xs font-semibold text-muted-foreground">Couldn’t load deals</div>
                <div className="mt-1 text-xs text-muted-foreground">{(deals.error as any)?.message ?? "Unknown error"}</div>
              </div>
            ) : deals.isLoading ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-11 rounded-2xl shimmer" />
                ))}
              </div>
            ) : (deals.data as any[] ?? []).length ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(deals.data as any[] ?? []).slice(0, 6).map((d: any) => (
                  <button
                    key={d.id}
                    onClick={() => setTestDealId(String(d.id))}
                    className={cn(
                      "ring-focus text-left rounded-2xl border border-border bg-background/60 px-4 py-3 shadow-sm",
                      "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-muted/60",
                    )}
                    data-testid={`deal-pick-${d.id}`}
                    type="button"
                  >
                    <div className="line-clamp-1 text-sm font-bold">{d.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      id: <span className="font-mono">{String(d.id).slice(0, 10)}…</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={TicketX}
                title="No deals available for picks"
                description="Once the aggregator runs, you’ll be able to pick a recent dealId here."
              />
            )}
          </div>

          <Button
            onClick={sendTest}
            disabled={test.isPending}
            className={cn(
              "ring-focus rounded-xl",
              "bg-gradient-to-r from-accent to-accent/80 text-accent-foreground",
              "shadow-lg shadow-accent/20 hover:shadow-xl hover:shadow-accent/25 hover:-translate-y-0.5",
              "active:translate-y-0 active:shadow-md transition-all duration-200 ease-out",
            )}
            data-testid="push-send-test"
          >
            {test.isPending ? (
              "Sending…"
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Send test
              </>
            )}
          </Button>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Pro tip
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            If you’ve enabled push in Preferences and subscribed successfully, the system can notify you on scheduled runs.
            If notifications don’t arrive, check browser permission, service worker registration, and backend VAPID configuration.
          </p>
        </div>
      </section>

      <section className="card-elevated animate-float-in stagger-3 p-5 md:p-6" data-testid="sms-alerts">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
            <MessageSquare className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display text-xl font-bold">SMS deal alerts</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Get deals by text — price-drop alerts on items you track, price-target hits, and up to 4 scheduled new-deal alerts per day (8am, 12pm, 4pm, 8pm ET).
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background/60 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary" />
              <div className="text-sm font-bold">Price-drop alerts</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Get a text the moment a tracked item drops in price.</div>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <div className="text-sm font-bold">Price-target alerts</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Set your target and we'll text you when it's reached.</div>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <div className="text-sm font-bold">New-deal alerts</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">New deals in your favorite sports, on scheduled runs.</div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="text-sm font-bold">Set up SMS in 2 steps</div>
          <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li><strong>1.</strong> Open <strong>Preferences</strong>, enter your mobile number, turn on <strong>SMS alerts</strong>, and check the consent box.</li>
            <li><strong>2.</strong> Come back here and tap <strong>Send test SMS</strong> to confirm it's working.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/app/preferences">
              <Button variant="secondary" className="ring-focus rounded-xl" data-testid="link-sms-preferences">
                <Settings className="mr-2 h-4 w-4" />
                Set phone &amp; enable SMS
              </Button>
            </Link>
            <Link href="/notifications">
              <Button variant="ghost" className="ring-focus rounded-xl" data-testid="link-sms-info">
                <ExternalLink className="mr-2 h-4 w-4" />
                View SMS program details
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-4 soft-divider h-px w-full" />

        <div className="mt-4">
          <div className="text-sm font-bold">Send a test SMS</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Sends a text to the phone number saved in your Preferences. Make sure SMS is enabled there first.
          </div>
          <Button
            onClick={sendSmsTest}
            disabled={smsTest.isPending}
            className="mt-3 ring-focus rounded-xl"
            data-testid="sms-send-test"
          >
            {smsTest.isPending ? (
              "Sending…"
            ) : (
              <>
                <MessageSquare className="mr-2 h-4 w-4" />
                Send test SMS
              </>
            )}
          </Button>
        </div>
      </section>
    </AppShell>
  );
}

async function createBrowserSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  if (!window.isSecureContext) return null;

  // We can't assume a SW path exists in this template. We try registering one; if missing, this will fail and UI will show error.
  const reg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
  if (!reg) return null;

  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  // Without a public VAPID key from server, we can't create a real subscription.
  // We'll still attempt with a placeholder to surface backend gaps.
  const vapidPublicKey = await fetch("/api/push/public-key", { credentials: "include" })
    .then(async (r) => (r.ok ? (await r.json())?.publicKey : null))
    .catch(() => null);

  const applicationServerKey = vapidPublicKey ? urlBase64ToUint8Array(vapidPublicKey) : undefined;

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
}

function arrayBufferToBase64Url(buf: ArrayBuffer | null) {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// Base64URL → Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const outputArray = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    outputArray[i] = raw.charCodeAt(i);
  }
  return outputArray;
}
