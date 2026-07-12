import { useState } from "react";
import Seo from "@/components/Seo";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  CheckCircle,
  ChevronRight,
  Filter,
  Search,
  ShieldCheck,
  Tag,
  TrendingDown,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface PopularProductItem {
  name: string;
  slug: string;
  sport: string;
  source: "admin" | "trending";
}

const FALLBACK_PRODUCTS: PopularProductItem[] = [
  { name: "Wilson A2000", slug: "wilson-a2000", sport: "Baseball", source: "admin" },
  { name: "Wilson A2K", slug: "wilson-a2k", sport: "Baseball", source: "admin" },
  { name: "Rawlings Heart of the Hide", slug: "rawlings-heart-of-the-hide", sport: "Baseball", source: "admin" },
  { name: "Easton Hype Fire", slug: "easton-hype-fire", sport: "Baseball", source: "admin" },
  { name: "Callaway Paradym", slug: "callaway-paradym", sport: "Golf", source: "admin" },
  { name: "Nike Air Max", slug: "nike-air-max", sport: "Training", source: "admin" },
];

const SPORTS = [
  { name: "Baseball", slug: "baseball", emoji: "⚾" },
  { name: "Basketball", slug: "basketball", emoji: "🏀" },
  { name: "Football", slug: "football", emoji: "🏈" },
  { name: "Golf", slug: "golf", emoji: "⛳" },
  { name: "Soccer", slug: "soccer", emoji: "⚽" },
  { name: "Tennis", slug: "tennis", emoji: "🎾" },
  { name: "Fishing", slug: "fishing", emoji: "🎣" },
  { name: "Hockey", slug: "hockey", emoji: "🏒" },
  { name: "Softball", slug: "fastpitch-softball", emoji: "🥎" },
  { name: "Lacrosse", slug: "lacrosse", emoji: "🥍" },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    icon: Zap,
    title: "We track deals 24/7",
    desc: "Our system syncs deals from 20+ retailers and marketplaces — updated four times a day. New listings, price drops, and clearance events are captured automatically.",
  },
  {
    step: "2",
    icon: Filter,
    title: "You filter what matters",
    desc: "Narrow results by sport, gear type, condition, brand, and how much you want to save. The more specific you get, the faster you find the deal.",
  },
  {
    step: "3",
    icon: ArrowRight,
    title: "Click straight to the deal",
    desc: "Every deal links directly to the retailer's page. No middleman, no markup — you pay the same price you'd find by going there yourself.",
  },
];

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: "Prices come from real retailers",
    desc: "Every deal links to an actual product page at a real retailer. We don't host products or set prices.",
  },
  {
    icon: TrendingDown,
    title: "We track price history",
    desc: "You can see whether today's price is actually a deal based on recent price history for that item.",
  },
  {
    icon: BadgeCheck,
    title: "Discounts are verified",
    desc: "We compare prices against manufacturer MSRP where available — not just whatever the retailer claims.",
  },
  {
    icon: Tag,
    title: "Free to use, always",
    desc: "TSS Deals is free for anyone to browse. We earn a small commission if you buy through a link, at no extra cost to you.",
  },
];

const FAQS = [
  {
    q: "Do I buy from TSS Deals or the retailer?",
    a: "You buy directly from the retailer — Dick's, eBay, Academy, Wilson, or whichever store the deal is from. We link you straight to their product page. TSS Deals never handles money or inventory.",
  },
  {
    q: "How often are deals updated?",
    a: "Our system syncs deals four times a day — at 8am, 12pm, 4pm, and 8pm Eastern. Deals are also checked for staleness regularly and removed when they expire or sell out.",
  },
  {
    q: "Why do prices sometimes change after I click?",
    a: "Prices are controlled by the retailer and can change at any time. We do our best to keep listings current, but we recommend checking the retailer's page for the final price before purchasing.",
  },
  {
    q: "Is there a cost to use the site?",
    a: "No. TSS Deals is completely free to use. We earn affiliate commissions from some retailers when you make a purchase through our links. This doesn't affect the price you pay.",
  },
  {
    q: "How do you make money?",
    a: "When you click a deal and make a purchase, we sometimes earn a small affiliate commission from the retailer — like a referral fee. The price is identical to what you'd pay going directly to the store.",
  },
  {
    q: "Can I get notified when prices drop?",
    a: "Yes. You can sign up for SMS deal alerts at tssdeals.com/notifications, or create an account to set price alerts on specific products.",
  },
];

export default function Landing() {
  const { data: popularProducts } = useQuery<PopularProductItem[]>({
    queryKey: ["/api/popular-products"],
  });

  const products = popularProducts && popularProducts.length > 0 ? popularProducts : FALLBACK_PRODUCTS;

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="TSS Deals — Sporting Goods Deal Aggregator"
        description="Find the best sporting goods deals in one place. Compare prices across 20+ retailers by sport, gear type, condition, and discount — without opening ten tabs."
      />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/images/tss-logo.jpeg"
                alt="TSS Deals"
                className="h-9 w-auto rounded-lg"
                data-testid="img-tss-logo-header"
              />
              <div className="leading-tight">
                <div className="text-base font-bold tracking-tight">TSS Deals</div>
                <div className="hidden text-[11px] text-muted-foreground sm:block">Sporting goods deals in one place</div>
              </div>
            </div>

            <nav className="flex items-center gap-1">
              <Link
                href="/guides"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-block"
                data-testid="nav-guides-landing"
              >
                Buyer's Guides
              </Link>
              <Link
                href="/app/deals"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-block"
                data-testid="nav-browse-deals"
              >
                Browse Deals
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => (window.location.href = "/api/login")}
                data-testid="landing-login"
              >
                Sign in
              </Button>
              <Link href="/app/deals">
                <Button
                  size="sm"
                  className="ml-1 rounded-lg"
                  data-testid="landing-browse-cta-header"
                >
                  Browse Deals
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border/50 bg-gradient-to-b from-primary/5 to-background py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <CheckCircle className="h-3.5 w-3.5" />
            Updated 4x daily · 20+ retailers · Free to use
          </div>

          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Find the best sporting goods deals{" "}
            <span className="text-primary">in one place</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            We track deals across 20+ retailers so you can compare prices, filter by sport and gear type,
            and click straight to the deal — without opening ten tabs.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/app/deals" data-testid="landing-cta-primary">
              <Button
                size="lg"
                className="h-12 w-full rounded-xl px-8 text-base sm:w-auto"
              >
                Browse Deals
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <a href="#how-it-works" data-testid="landing-cta-how">
              <Button
                variant="outline"
                size="lg"
                className="h-12 w-full rounded-xl px-8 text-base sm:w-auto"
              >
                How It Works
              </Button>
            </a>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Free to use · No account required to browse
          </p>
        </div>
      </section>

      {/* Quick trust stats bar */}
      <section className="border-b border-border/50 bg-muted/40 py-5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
            {[
              { value: "20+", label: "Retailers tracked" },
              { value: "150k+", label: "Active deals" },
              { value: "4×/day", label: "Deal updates" },
              { value: "18", label: "Sports covered" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="mt-0.5 text-xs font-medium text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">How it works</h2>
            <p className="mt-2 text-base text-muted-foreground">Three steps, no account required.</p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, desc }) => (
              <div
                key={step}
                className="relative rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Step {step}
                  </span>
                </div>
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Browse by Sport */}
      <section className="border-t border-border/50 bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Browse by sport</h2>
              <p className="mt-1.5 text-base text-muted-foreground">
                Pick a sport to see deals filtered to that category.
              </p>
            </div>
            <Link href="/deals" className="text-sm font-semibold text-primary hover:underline" data-testid="landing-browse-all-deals">
              All sports & brands →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {SPORTS.map((sport) => (
              <Link
                key={sport.slug}
                href={`/deals/${sport.slug}`}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 font-medium transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm"
                data-testid={`landing-sport-link-${sport.slug}`}
              >
                <span className="text-lg">{sport.emoji}</span>
                <span className="text-sm">{sport.name}</span>
                <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Products */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Popular products</h2>
            <p className="mt-1.5 text-base text-muted-foreground">
              Track prices and find the best deals on the most searched gear.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Link
                key={product.slug}
                href={`/deals/${product.slug}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 transition-all hover:border-primary/30 hover:bg-primary/5 group"
                data-testid={`landing-product-link-${product.slug}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{product.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{product.sport}</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why Trust TSS Deals */}
      <section className="border-t border-border/50 bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Why trust TSS Deals?</h2>
            <p className="mt-2 text-base text-muted-foreground max-w-2xl mx-auto">
              We're not a retailer and we don't set prices. Our job is to surface the best deals we can find, honestly.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_POINTS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Get Alerts CTA */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center sm:p-12">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
              <BellRing className="h-6 w-6 text-primary" />
            </div>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">Get deal alerts</h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
              Sign up for SMS deal notifications or create a free account to set price alerts on specific products.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/notifications" data-testid="landing-sms-alerts">
                <Button size="lg" className="h-12 w-full rounded-xl px-7 text-base sm:w-auto">
                  Get SMS Alerts
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                className="h-12 w-full rounded-xl px-7 text-base sm:w-auto"
                onClick={() => (window.location.href = "/api/login")}
                data-testid="landing-login-secondary"
              >
                Create Free Account
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/50 bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Frequently asked questions</h2>
            <p className="mt-2 text-base text-muted-foreground">
              Common questions from first-time visitors.
            </p>
          </div>
          <Accordion type="single" collapsible className="space-y-2">
            {FAQS.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="rounded-xl border border-border bg-card px-5 shadow-sm data-[state=open]:border-primary/30"
              >
                <AccordionTrigger
                  className="text-left text-sm font-semibold hover:no-underline"
                  data-testid={`faq-trigger-${i}`}
                >
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground" data-testid={`faq-content-${i}`}>
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Buyer's Guide + Blog */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div>
                <div className="mb-3 text-2xl">📖</div>
                <h3 className="text-lg font-bold">Sporting Goods Buyer's Guides</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  36 expert buying guides across 18 sports. Learn what to look for in gloves, bats, cleats, clubs, and more — then find the best deals.
                </p>
              </div>
              <Link href="/guides" className="mt-5 inline-block" data-testid="landing-guides-cta">
                <Button variant="outline" className="rounded-xl">
                  Browse Guides
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div>
                <div className="mb-3 text-2xl">✍️</div>
                <h3 className="text-lg font-bold">Blog & Gear Reviews</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Expert gear guides, product reviews, and maintenance tips from the team at Twin Seam Sports. Stay informed and get the most out of your equipment.
                </p>
              </div>
              <Link href="/app/blog" className="mt-5 inline-block" data-testid="landing-blog-cta">
                <Button variant="outline" className="rounded-xl">
                  Read the Blog
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/30 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* About */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5 mb-3">
                <img src="/images/tss-logo.jpeg" alt="TSS Deals" className="h-8 w-auto rounded-md" />
                <span className="font-bold">TSS Deals</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground max-w-sm">
                TSS Deals is a sporting goods deal aggregator run by Twin Seam Sports in Maryville, TN.
                We track deals across 20+ retailers so you can find the best price without the hassle.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground max-w-sm">
                <strong className="text-foreground/70">Affiliate disclosure:</strong> Some links on this site are affiliate links.
                If you click and make a purchase, we may earn a small commission at no extra cost to you.
                This helps us keep the site free.
              </p>
              <a
                href="mailto:tssdeals@twinseamsports.com"
                className="mt-3 inline-block text-xs text-primary hover:underline"
              >
                tssdeals@twinseamsports.com
              </a>
            </div>

            {/* Navigate */}
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Navigate</h4>
              <ul className="space-y-2">
                {[
                  { href: "/app/deals", label: "Browse Deals" },
                  { href: "/deals", label: "Deals by Sport" },
                  { href: "/guides", label: "Buyer's Guides" },
                  { href: "/app/blog", label: "Blog & Reviews" },
                  { href: "/notifications", label: "SMS Deal Alerts" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Legal & Info</h4>
              <ul className="space-y-2">
                {[
                  { href: "/about", label: "About Us" },
                  { href: "/contact", label: "Contact" },
                  { href: "/privacy", label: "Privacy Policy" },
                  { href: "/terms", label: "Terms of Service" },
                  { href: "/disclaimer", label: "Disclaimer" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid={`footer-${link.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-border/50 pt-6 text-center text-xs text-muted-foreground">
            <p>
              © {new Date().getFullYear()} TSS Deals / Twin Seam Sports · Maryville, TN ·{" "}
              <span className="italic">Prices and availability may change at any time. Always verify on the retailer's site before purchasing.</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
