import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import Seo from "@/components/Seo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Search,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buyersGuideArticles, type GuideArticle } from "@/data/buyers-guide-articles";
import { useState } from "react";

const SPORTS = Array.from(new Set(buyersGuideArticles.map((a) => a.sport))).sort();

function ArticleList() {
  const [sportFilter, setSportFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return buyersGuideArticles.filter((a) => {
      if (sportFilter !== "all" && a.sport !== sportFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          a.title.toLowerCase().includes(q) ||
          a.excerpt.toLowerCase().includes(q) ||
          a.sport.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sportFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, GuideArticle[]>();
    for (const a of filtered) {
      const list = map.get(a.sport) || [];
      list.push(a);
      map.set(a.sport, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="relative min-h-screen bg-mesh grain">
      <Seo
        title="Sporting Goods Buyer's Guide | TwinSeam Deals"
        description="Expert buying guides for sporting goods across 18 sports. Learn what to look for when shopping for baseball gloves, golf clubs, hockey sticks, and more."
        ogType="website"
      />

      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/55 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <img
                src="/images/tss-logo.jpeg"
                alt="Twin Seam Sports"
                className="h-10 w-auto"
              />
              <div className="leading-tight">
                <div className="font-display text-lg font-bold">TwinSeam Deals</div>
                <div className="text-xs font-medium text-muted-foreground">Buyer's Guide</div>
              </div>
            </div>
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="link-back-home">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
            <BookOpen className="h-4 w-4" />
            {buyersGuideArticles.length} guides across {SPORTS.length} sports
          </div>
          <h1 className="font-display text-3xl font-bold mb-2" data-testid="heading-buyers-guide">
            Sporting Goods Buyer's Guide
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
            Expert buying advice to help you find quality gear at the right price. Each guide covers
            what to look for, how to choose by position or skill level, and how to find the best deals.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search guides..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-guide-search"
            />
          </div>
          <Select value={sportFilter} onValueChange={setSportFilter}>
            <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-sport-filter">
              <SelectValue placeholder="All Sports" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {SPORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {grouped.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="mx-auto h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No guides match your search.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {grouped.map(([sport, articles]) => (
              <section key={sport}>
                <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  {sport}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {articles.map((article) => (
                    <Link key={article.slug} href={`/guides/${article.slug}`}>
                      <Card
                        className="p-5 h-full hover-elevate cursor-pointer transition-all"
                        data-testid={`card-guide-${article.slug}`}
                      >
                        <Badge variant="outline" className="mb-3 text-xs">
                          {article.sport}
                        </Badge>
                        <h3 className="font-semibold text-sm leading-snug mb-2">
                          {article.title}
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                          {article.excerpt}
                        </p>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          Read guide
                          <ArrowRight className="h-3 w-3" />
                        </span>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-12 card-elevated p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">Ready to find deals?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Now that you know what to look for, let TwinSeam Deals find the best prices for you.
              </p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Link href="/app/deals">
                <Button data-testid="link-guide-deals">
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  Browse Deals
                </Button>
              </Link>
              <a href="https://www.twinseamsports.com" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" data-testid="link-guide-tss">
                  Visit Twin Seam Sports
                </Button>
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="pb-10 pt-4">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="soft-divider h-px w-full" />
          <div className="mt-6 flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between flex-wrap">
            <div>© {new Date().getFullYear()} TwinSeam Deals</div>
            <div className="flex items-center gap-4 flex-wrap">
              <Link href="/app/blog" className="hover:text-foreground transition-colors">Blog & Reviews</Link>
              <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
              <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link href="/disclaimer" className="hover:text-foreground transition-colors">Disclaimer</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ArticleDetail({ slug }: { slug: string }) {
  const article = buyersGuideArticles.find((a) => a.slug === slug);

  if (!article) {
    return (
      <div className="relative min-h-screen bg-mesh grain flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold mb-2">Guide Not Found</h1>
          <p className="text-sm text-muted-foreground mb-4">This guide may have been moved or removed.</p>
          <Link href="/guides">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All Guides
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const sameSport = buyersGuideArticles.filter(
    (a) => a.sportId === article.sportId && a.slug !== article.slug
  );

  const contentHtml = article.content
    .split("\n\n")
    .map((para) => {
      para = para.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      if (para.startsWith("- ") || para.startsWith("* ")) {
        const items = para
          .split("\n")
          .filter((l) => l.startsWith("- ") || l.startsWith("* "))
          .map((l) => `<li>${l.slice(2)}</li>`)
          .join("");
        return `<ul class="list-disc pl-6 space-y-1 text-sm leading-relaxed text-foreground/90">${items}</ul>`;
      }
      return `<p class="text-sm leading-relaxed text-foreground/90">${para}</p>`;
    })
    .join("");

  return (
    <div className="relative min-h-screen bg-mesh grain">
      <Seo
        title={`${article.title} | TwinSeam Deals`}
        description={article.excerpt}
        ogType="article"
      />

      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/55 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <img
                src="/images/tss-logo.jpeg"
                alt="Twin Seam Sports"
                className="h-10 w-auto"
              />
              <div className="leading-tight">
                <div className="font-display text-lg font-bold">Buyer's Guide</div>
              </div>
            </div>
            <Link href="/guides">
              <Button variant="ghost" size="sm" data-testid="link-back-guides">
                <ArrowLeft className="mr-2 h-4 w-4" />
                All Guides
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Badge variant="outline" className="mb-4">{article.sport}</Badge>

        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight mb-3" data-testid="heading-guide-title">
          {article.title}
        </h1>

        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          {article.excerpt}
        </p>

        <article
          className="space-y-4"
          data-testid="guide-content"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />

        <div className="mt-10 card-elevated p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">Find deals on {article.sport} gear</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                TwinSeam Deals tracks prices across top retailers to find the best discounts.
              </p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Link href="/app/deals">
                <Button data-testid="link-article-deals">
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  Browse Deals
                </Button>
              </Link>
              <a href="https://www.twinseamsports.com" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" data-testid="link-article-tss">
                  Twin Seam Sports
                </Button>
              </a>
            </div>
          </div>
        </div>

        {sameSport.length > 0 && (
          <div className="mt-8">
            <h3 className="font-display text-lg font-bold mb-4">
              More {article.sport} Guides
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {sameSport.map((related) => (
                <Link key={related.slug} href={`/guides/${related.slug}`}>
                  <Card
                    className="p-4 hover-elevate cursor-pointer transition-all"
                    data-testid={`card-related-${related.slug}`}
                  >
                    <h4 className="font-semibold text-sm mb-1">{related.title}</h4>
                    <p className="text-xs text-muted-foreground">{related.excerpt}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="pb-10 pt-4">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="soft-divider h-px w-full" />
          <div className="mt-6 flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between flex-wrap">
            <div>© {new Date().getFullYear()} TwinSeam Deals</div>
            <div className="flex items-center gap-4 flex-wrap">
              <Link href="/guides" className="hover:text-foreground transition-colors">All Guides</Link>
              <Link href="/app/blog" className="hover:text-foreground transition-colors">Blog & Reviews</Link>
              <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function BuyersGuide() {
  const [, params] = useRoute("/guides/:slug");

  if (params?.slug) {
    return <ArticleDetail slug={params.slug} />;
  }

  return <ArticleList />;
}
