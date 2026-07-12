import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import Seo from "@/components/Seo";
import { ArrowLeft, ExternalLink, ShoppingBag, TrendingDown, Tag, Bell, ChevronRight, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface DealItem {
  id: string;
  title: string;
  brand: string | null;
  url: string;
  imageUrl: string | null;
  priceCents: number;
  msrpCents: number | null;
  percentOff: string | null;
  sourceId: string;
  condition: string | null;
  sportId: string | null;
  equipmentTypeId: string | null;
  hasPriceDrop: boolean;
  isLow30d: boolean;
  promoCode: string | null;
}

interface SeoPageData {
  type: "sport" | "category" | "brand" | "product";
  name: string;
  slug: string;
  deals: DealItem[];
  categories?: { name: string; slug: string; id: string }[];
  sportName?: string;
  sportSlug?: string;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getSourceLabel(sourceId: string): string {
  const labels: Record<string, string> = {
    "ebay": "eBay",
    "twin-seam-sports": "Twin Seam Sports",
    "dicks-sporting-goods": "Dick's Sporting Goods",
    "golf-galaxy": "Golf Galaxy",
    "sidelineswap": "SidelineSwap",
    "baseball-resale": "Baseball Resale",
    "nameofthegame": "NameOfTheGame",
  };
  if (labels[sourceId]) return labels[sourceId];
  if (sourceId.startsWith("cj-partner")) return "Partner Retailer";
  if (sourceId.startsWith("impact-")) return "Impact Partner";
  if (sourceId.startsWith("rakuten-")) return "Rakuten Partner";
  if (sourceId.startsWith("fanatics-")) return "Fanatics";
  return sourceId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function SmsSignupCta({ productName }: { productName: string }) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || phone.replace(/\D/g, "").length < 10) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/sms/subscribe", { phoneNumber: phone, consent: true });
      setDone(true);
      toast({ title: "Subscribed!", description: "You'll receive a confirmation text shortly." });
    } catch {
      toast({ title: "Error", description: "Could not subscribe. Try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 text-center text-sm text-green-600">
        You're subscribed! Check your phone for a confirmation text.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-card p-5" data-testid="sms-signup-cta">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">Track price drops for {productName}</h3>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          type="tel"
          placeholder="(555) 123-4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-xl"
          data-testid="input-sms-cta-phone"
        />
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(Boolean(v))} className="mt-0.5" data-testid="checkbox-sms-cta-consent" />
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            I agree to receive recurring automated promotional and deal alert text messages from TSSDeals at the phone number provided. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to unsubscribe. Reply HELP for help. Consent is not a condition of purchase. View our{" "}
            <a href="/privacy" className="underline text-primary" target="_blank">Privacy Policy</a>{" "}and{" "}
            <a href="/terms" className="underline text-primary" target="_blank">Terms of Service</a>.
          </span>
        </label>
        <Button type="submit" size="sm" className="w-full rounded-xl" disabled={submitting || !consent} data-testid="button-sms-cta-subscribe">
          {submitting ? "Subscribing..." : "Get SMS Alerts"}
        </Button>
      </form>
    </div>
  );
}

function DealCard({ deal }: { deal: DealItem }) {
  return (
    <a
      href={deal.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-xl border border-border bg-card p-3 hover:shadow-md transition-shadow"
      data-testid={`deal-card-${deal.id}`}
    >
      {deal.imageUrl && (
        <div className="flex-shrink-0 h-20 w-20 rounded-lg bg-muted overflow-hidden">
          <img src={deal.imageUrl} alt={deal.title} className="h-full w-full object-contain" loading="lazy" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">{deal.title}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-base font-bold text-green-600">{formatPrice(deal.priceCents)}</span>
          {deal.msrpCents && (
            <span className="text-xs text-muted-foreground line-through">{formatPrice(deal.msrpCents)}</span>
          )}
          {deal.percentOff && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{Math.round(Number(deal.percentOff))}% off</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] text-muted-foreground">{getSourceLabel(deal.sourceId)}</span>
          {deal.brand && <span className="text-[11px] text-muted-foreground">· {deal.brand}</span>}
          {deal.hasPriceDrop && <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-600 border-orange-300">Price Drop</Badge>}
          {deal.isLow30d && <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-600 border-blue-300">30d Low</Badge>}
          {deal.promoCode && <Badge variant="outline" className="text-[10px] px-1 py-0 text-purple-600 border-purple-300">Code: {deal.promoCode}</Badge>}
        </div>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
    </a>
  );
}

function PriceComparisonTable({ deals }: { deals: DealItem[] }) {
  const grouped = new Map<string, DealItem>();
  for (const deal of deals) {
    const key = deal.sourceId;
    const existing = grouped.get(key);
    if (!existing || deal.priceCents < existing.priceCents) {
      grouped.set(key, deal);
    }
  }
  const sorted = Array.from(grouped.values()).sort((a, b) => a.priceCents - b.priceCents);
  if (sorted.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="price-comparison-table">
      <div className="bg-muted/30 px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Price Comparison
        </h3>
      </div>
      <div className="divide-y divide-border">
        {sorted.map((deal, i) => (
          <a
            key={deal.id}
            href={deal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
            data-testid={`price-row-${deal.sourceId}`}
          >
            <div className="flex items-center gap-3">
              {i === 0 && <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0">Best</Badge>}
              <span className="text-sm">{getSourceLabel(deal.sourceId)}</span>
              {deal.condition === "preowned" && <Badge variant="outline" className="text-[10px] px-1 py-0">Used</Badge>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">{formatPrice(deal.priceCents)}</span>
              {deal.percentOff && (
                <span className="text-xs text-green-600">{Math.round(Number(deal.percentOff))}% off</span>
              )}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function CategoryGrid({ categories }: { categories: { name: string; slug: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="category-grid">
      {categories.map((cat) => (
        <Link
          key={cat.slug}
          href={`/deals/${cat.slug}`}
          className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:shadow-md hover:border-primary/30 transition-all"
          data-testid={`category-link-${cat.slug}`}
        >
          <span className="text-sm font-medium">{cat.name}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

function DealsIndex() {
  const { data: slugs, isLoading } = useQuery<{ slug: string; type: string; name: string }[]>({
    queryKey: ["/api/seo/slugs"],
  });
  const { data: popularProductsData } = useQuery<any[]>({
    queryKey: ["/api/popular-products"],
  });

  const sports = (slugs || []).filter((s) => s.type === "sport");
  const categories = (slugs || []).filter((s) => s.type === "category");
  const brands = (slugs || []).filter((s) => s.type === "brand");

  return (
    <div className="relative min-h-screen bg-mesh grain">
      <Seo title="All Deals & Categories | TSSDeals" description="Browse sporting goods deals by sport, category, or brand. Find the best prices on baseball, football, basketball, golf gear and more." />
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/55 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <img src="/images/tss-logo.jpeg" alt="Twin Seam Sports" className="h-10 w-auto" />
              <div className="leading-tight">
                <div className="font-display text-lg font-bold">TSSDeals</div>
              </div>
            </div>
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="link-back-home">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Deals
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
        <div>
          <h1 className="font-display text-3xl font-bold mb-2" data-testid="text-deals-index-title">Browse All Deals</h1>
          <p className="text-muted-foreground">Find the best deals on sporting goods by sport, category, or brand.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <section>
              <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
                <Search className="h-5 w-5" />
                Shop by Sport
              </h2>
              <CategoryGrid categories={sports} />
            </section>

            {categories.length > 0 && (
              <section>
                <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Shop by Category
                </h2>
                <CategoryGrid categories={categories} />
              </section>
            )}

            {popularProductsData && popularProductsData.length > 0 && (
              <section>
                <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  Popular Products
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="popular-products-grid">
                  {popularProductsData.map((product: any) => (
                    <Link
                      key={product.slug}
                      href={`/deals/${product.slug}`}
                      className="flex items-center justify-between rounded-xl border border-border bg-card p-3 hover:shadow-md hover:border-accent/30 transition-all group"
                      data-testid={`product-link-${product.slug}`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium group-hover:text-primary transition-colors">{product.name}</div>
                        <div className="text-[11px] text-muted-foreground">{product.sport}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {brands.length > 0 && (
              <section>
                <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
                  <TrendingDown className="h-5 w-5" />
                  Shop by Brand
                </h2>
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => (
                    <Link key={b.slug} href={`/deals/${b.slug}`}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-primary/5 transition-colors px-3 py-1.5 text-sm" data-testid={`brand-badge-${b.slug}`}>
                        {b.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="pb-10 pt-4">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="soft-divider h-px w-full" />
          <div className="mt-6 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between flex-wrap">
            <div>&copy; {new Date().getFullYear()} TSSDeals</div>
            <div className="flex items-center gap-4 flex-wrap">
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
              <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function DealSlugPage({ slug }: { slug: string }) {
  const { data, isLoading, error } = useQuery<SeoPageData>({
    queryKey: [`/api/seo/page/${slug}`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-mesh grain flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-mesh grain flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">No deals found</h1>
        <p className="text-muted-foreground">We couldn't find any deals for "{slug.replace(/-/g, " ")}".</p>
        <Link href="/deals"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Browse All Deals</Button></Link>
      </div>
    );
  }

  const titleSuffix = data.type === "sport" ? `${data.name} Deals` : data.type === "category" ? `${data.name} Deals` : data.type === "brand" ? `${data.name} Deals` : `${data.name} Deals & Price Drops`;
  const seoTitle = `${titleSuffix} | TSSDeals`;
  const seoDesc = data.type === "product"
    ? `Compare prices for ${data.name} across major retailers. Track price drops and find the best deal today on TSSDeals.`
    : `Find the best ${data.name.toLowerCase()} deals at up to 50%+ off MSRP. Compare prices across retailers on TSSDeals.`;

  const bestPrice = data.deals.length > 0 ? Math.min(...data.deals.map((d) => d.priceCents)) : null;

  return (
    <div className="relative min-h-screen bg-mesh grain">
      <Seo title={seoTitle} description={seoDesc} />
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/55 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <img src="/images/tss-logo.jpeg" alt="Twin Seam Sports" className="h-10 w-auto" />
              <div className="leading-tight">
                <div className="font-display text-lg font-bold">TSSDeals</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/deals">
                <Button variant="ghost" size="sm" data-testid="link-all-deals">
                  All Deals
                </Button>
              </Link>
              <Link href="/">
                <Button variant="ghost" size="sm" data-testid="link-back-home">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <nav className="text-xs text-muted-foreground mb-4 flex items-center gap-1 flex-wrap" data-testid="breadcrumb">
          <Link href="/deals" className="hover:text-foreground transition-colors">Deals</Link>
          <ChevronRight className="h-3 w-3" />
          {data.sportSlug && data.sportName && (
            <>
              <Link href={`/deals/${data.sportSlug}`} className="hover:text-foreground transition-colors">{data.sportName}</Link>
              <ChevronRight className="h-3 w-3" />
            </>
          )}
          <span className="text-foreground">{data.name}</span>
        </nav>

        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold mb-2" data-testid="text-deal-page-title">
            {data.name} {data.type !== "product" ? "Deals" : "Deals & Price Drops"}
          </h1>
          <p className="text-muted-foreground" data-testid="text-deal-page-description">
            {data.type === "sport" && `Find the best ${data.name.toLowerCase()} deals at up to 50%+ off MSRP. TSSDeals tracks prices across multiple retailers so you can find the lowest price available today.`}
            {data.type === "category" && `Compare prices on ${data.name.toLowerCase()} across major retailers. Track price drops and find the best deal today.`}
            {data.type === "brand" && `Shop ${data.name} deals with discounts up to 50%+ off MSRP. Compare prices across multiple retailers.`}
            {data.type === "product" && `Find the best deals on ${data.name}. TSSDeals tracks prices across multiple retailers so you can see the lowest price available today.`}
          </p>
          {bestPrice !== null && (
            <div className="mt-2 text-sm">
              <span className="text-muted-foreground">Best price today: </span>
              <span className="text-lg font-bold text-green-600" data-testid="text-best-price">{formatPrice(bestPrice)}</span>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {data.categories && data.categories.length > 0 && (
              <section>
                <h2 className="font-display text-lg font-bold mb-3">{data.name} Categories</h2>
                <CategoryGrid categories={data.categories} />
              </section>
            )}

            {data.deals.length > 1 && (
              <PriceComparisonTable deals={data.deals} />
            )}

            <section>
              <h2 className="font-display text-lg font-bold mb-3">
                {data.deals.length} {data.deals.length === 1 ? "Deal" : "Deals"} Found
              </h2>
              <div className="space-y-2">
                {data.deals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <SmsSignupCta productName={data.name} />

            {data.sportSlug && data.sportName && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-2">More {data.sportName} Deals</h3>
                <Link href={`/deals/${data.sportSlug}`}>
                  <Button variant="outline" size="sm" className="w-full rounded-xl" data-testid="link-sport-deals">
                    Browse All {data.sportName} Deals
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-2">Browse More</h3>
              <Link href="/deals">
                <Button variant="outline" size="sm" className="w-full rounded-xl" data-testid="link-browse-all">
                  All Sports & Categories
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="pb-10 pt-4 mt-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="soft-divider h-px w-full" />
          <div className="mt-6 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between flex-wrap">
            <div>&copy; {new Date().getFullYear()} TSSDeals</div>
            <div className="flex items-center gap-4 flex-wrap">
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
              <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function DealPage() {
  const [, params] = useRoute("/deals/:slug");
  const slug = params?.slug;

  if (!slug) return <DealsIndex />;
  return <DealSlugPage slug={slug} />;
}
