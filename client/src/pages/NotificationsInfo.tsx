import { useState } from "react";
import Seo from "@/components/Seo";
import { Link } from "wouter";
import { ArrowLeft, Bell, MessageSquare, TrendingDown, Target, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function NotificationsInfo() {
  const [phone, setPhone] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [transactionalConsent, setTransactionalConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const anyConsent = marketingConsent || transactionalConsent;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast({ title: "Invalid phone number", description: "Please enter a valid US phone number.", variant: "destructive" });
      return;
    }
    if (!anyConsent) {
      toast({ title: "Consent required", description: "Please select at least one type of message you'd like to receive.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/sms/subscribe", {
        phoneNumber: phone,
        marketingConsent,
        transactionalConsent,
      });
      setSubmitted(true);
      toast({ title: "You're subscribed!", description: "You'll receive a confirmation text shortly." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not subscribe. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-mesh grain">
      <Seo
        title="SMS Deal Alerts & Notifications | TSSDeals"
        description="Sign up for TSSDeals SMS notifications to receive deal alerts, price drop notifications, and price target alerts for sporting goods directly to your phone."
      />

      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/55 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <img
                src="/images/tss-logo.jpeg"
                alt="Twin Seam Sports"
                className="h-10 w-auto"
              />
              <div className="leading-tight">
                <div className="font-display text-lg font-bold">TSSDeals</div>
              </div>
            </div>
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="link-back-home">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4">
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl font-bold mb-3" data-testid="text-notifications-title">
            SMS Deal Alerts
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Never miss a deal. Get price drop alerts, deal notifications, and price target updates
            sent directly to your phone via text message.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 mb-10">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10">
                <TrendingDown className="h-5 w-5 text-blue-500" />
              </div>
              <h3 className="font-semibold">Price Drop Alerts</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Get notified instantly when items you're tracking drop in price.
            </p>
            <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground font-mono" data-testid="text-sample-price-drop">
              "TSSDeals: Price drop alert for your tracked item: Wilson A2000 now $189. View deal: [link] Reply STOP to opt out. Reply HELP for help."
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-green-500/10">
                <Target className="h-5 w-5 text-green-500" />
              </div>
              <h3 className="font-semibold">Price Target Alerts</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Set your target price and we'll text you when it's reached.
            </p>
            <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground font-mono" data-testid="text-sample-price-target">
              "TSSDeals: Your tracked item has hit your target price. View it now: [link] Reply STOP to opt out. Reply HELP for help."
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10">
                <Bell className="h-5 w-5 text-orange-500" />
              </div>
              <h3 className="font-semibold">New Deal Alerts</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Receive alerts when new deals drop in your favorite sports categories.
            </p>
            <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground font-mono" data-testid="text-sample-deal-alert">
              "TSSDeals: New baseball deals are available in your alerts. Shop now: [link] Reply STOP to opt out. Reply HELP for help."
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-500/10">
                <CheckCircle2 className="h-5 w-5 text-purple-500" />
              </div>
              <h3 className="font-semibold">Subscription Confirmation</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              After signing up, you'll receive a confirmation text.
            </p>
            <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground font-mono" data-testid="text-sample-welcome">
              "TSSDeals Alerts: You are subscribed to recurring promotional deal alerts from TSSDeals. Message frequency varies. Msg &amp; data rates may apply. Reply HELP for help or STOP to cancel."
            </div>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-primary/20 bg-card p-6 sm:p-8 mb-10" id="signup">
          <div className="text-center mb-6">
            <h2 className="font-display text-2xl font-bold mb-2" data-testid="text-signup-heading">
              Sign Up for SMS Deal Alerts
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your mobile phone number below to start receiving deal alerts via text message.
            </p>
            <div className="mt-3 rounded-lg bg-muted/50 px-4 py-3 text-xs text-muted-foreground space-y-0.5" data-testid="sms-program-info">
              <p><strong>Program:</strong> TSSDeals SMS Deal Alerts</p>
              <p><strong>Operated by:</strong> Twin Seam Sports · Maryville, TN</p>
              <p><strong>Opt-in URL:</strong> tssdeals.com/notifications</p>
              <p><strong>Contact:</strong> tssdeals@twinseamsports.com</p>
            </div>
          </div>

          {submitted ? (
            <div className="text-center py-6" data-testid="text-signup-success">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-1">You're subscribed!</h3>
              <p className="text-sm text-muted-foreground">
                Check your phone for a confirmation text from TSSDeals.
                You can manage your notification preferences anytime in{" "}
                <Link href="/app/preferences" className="text-primary underline">your settings</Link>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4">
              <div>
                <label htmlFor="phone" className="text-sm font-medium mb-1 block">
                  Mobile Phone Number
                </label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-xl"
                  data-testid="input-phone"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">US phone numbers only.</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground">
                  Choose which types of text messages you'd like to receive. Each is optional — select one or both.
                </p>

                <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-muted/30 p-3" data-testid="label-marketing-consent">
                  <Checkbox
                    checked={marketingConsent}
                    onCheckedChange={(v) => setMarketingConsent(Boolean(v))}
                    className="mt-0.5"
                    data-testid="checkbox-marketing-consent"
                  />
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">Marketing Messages.</span> By checking this box, you agree to receive recurring automated <strong>promotional</strong> text messages from TSSDeals (Twin Seam Sports) at the mobile number provided — including promotions, coupons, special offers, featured deals, and scheduled new-deal announcements. Message frequency varies (up to 4/day). Msg &amp; data rates may apply. Reply STOP to unsubscribe. Reply HELP for help. Consent is not a condition of purchase.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-muted/30 p-3" data-testid="label-transactional-consent">
                  <Checkbox
                    checked={transactionalConsent}
                    onCheckedChange={(v) => setTransactionalConsent(Boolean(v))}
                    className="mt-0.5"
                    data-testid="checkbox-transactional-consent"
                  />
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">Deal Alerts &amp; Account Notifications (Non-Marketing).</span> By checking this box, you agree to receive automated <strong>non-marketing</strong> text messages from TSSDeals (Twin Seam Sports) at the mobile number provided — such as price-drop and price-target alerts on items you choose to track, account notifications, and subscription confirmations. Msg &amp; data rates may apply. Reply STOP to unsubscribe. Reply HELP for help.
                  </span>
                </label>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  View our{" "}
                  <a href="/privacy" className="underline text-primary" target="_blank">Privacy Policy</a>,{" "}
                  <a href="/terms" className="underline text-primary" target="_blank">Terms of Service</a>, and{" "}
                  <a href="/sms-terms" className="underline text-primary" target="_blank">SMS Terms &amp; Conditions</a>.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full rounded-xl"
                disabled={submitting || !anyConsent}
                data-testid="button-subscribe"
              >
                {submitting ? "Submitting..." : "Opt In for Notifications"}
              </Button>

              <p className="text-center text-xs text-muted-foreground" data-testid="sms-short-disclaimer">
                Msg &amp; data rates may apply. Reply STOP to unsubscribe. Reply HELP for help.
              </p>
            </form>
          )}
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">How It Works</h2>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-1">Opt-In Process</h3>
                <p className="text-muted-foreground">
                  To receive SMS notifications, enter your mobile phone number above and check the
                  consent box for each message type you want. You can choose <strong>Marketing
                  Messages</strong> (promotions, coupons, special offers, and featured deals),
                  <strong> Deal Alerts &amp; Account Notifications (Non-Marketing)</strong> (price-drop
                  and price-target alerts on items you track, account notifications, plus
                  confirmations), or both — each is a separate, optional consent. None of the boxes are
                  pre-checked; you must actively opt in to at least one. Consent is not required to use
                  the website or browse deals.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Confirmation</h3>
                <p className="text-muted-foreground">
                  After submitting the form, you will receive a confirmation text message confirming
                  your subscription to TSSDeals SMS deal alerts.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Message Frequency</h3>
                <p className="text-muted-foreground">
                  Message frequency varies. You may receive up to 4 scheduled deal alerts per day
                  (at 8am, 12pm, 4pm, and 8pm ET), plus individual price alert and price target notifications.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Opting Out</h3>
                <p className="text-muted-foreground">
                  You can opt out at any time by replying <strong>STOP</strong> to any message.
                  You can also disable SMS notifications in your{" "}
                  <Link href="/app/preferences" className="text-primary underline">Preferences</Link> page.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Help</h3>
                <p className="text-muted-foreground">
                  Reply <strong>HELP</strong> to any message for assistance, or contact us at{" "}
                  <a href="mailto:tssdeals@twinseamsports.com" className="text-primary underline">tssdeals@twinseamsports.com</a>{" "}
                  or call (934) CALL-TSS (225-5877).
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Rates</h3>
                <p className="text-muted-foreground">
                  Message and data rates may apply. Carriers are not liable for delayed or undelivered messages.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="pb-10 pt-4">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="soft-divider h-px w-full" />
          <div className="mt-6 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between flex-wrap">
            <div>&copy; {new Date().getFullYear()} TSSDeals</div>
            <div className="flex items-center gap-4 flex-wrap">
              <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="footer-privacy">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="footer-terms">Terms of Service</Link>
              <Link href="/sms-terms" className="hover:text-foreground transition-colors" data-testid="footer-sms-terms">SMS Terms &amp; Conditions</Link>
              <Link href="/about" className="hover:text-foreground transition-colors" data-testid="footer-about">About</Link>
              <Link href="/contact" className="hover:text-foreground transition-colors" data-testid="footer-contact">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
