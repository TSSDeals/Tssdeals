import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute, Link } from "wouter";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  ExternalLink,
  Newspaper,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BlogArticle {
  slug: string;
  title: string;
  excerpt: string;
  imageUrl: string | null;
  publishedAt: string;
  url: string;
  content: string | null;
}

function ArticleList() {
  const articles = useQuery<BlogArticle[]>({
    queryKey: ["/api/blog/articles"],
  });

  return (
    <AppShell
      title="Twin Seam Blog & Product Reviews"
      subtitle="Expert guides, gear reviews, and tips from Twin Seam Sports."
    >
      <Seo
        title="Twin Seam Blog & Product Reviews | TwinSeam Deals"
        description="Read expert sporting goods guides, gear reviews, and pro tips from Twin Seam Sports. Learn about equipment selection, maintenance, and getting the most from your gear."
      />

      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="relative p-5 md:p-6">
            <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(700px_260px_at_0%_0%,hsl(var(--primary)/0.14),transparent_60%)]" />
            <div className="relative">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Newspaper className="h-4 w-4 text-primary" />
                <span className="font-semibold">From Twin Seam Sports</span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Our team shares expert knowledge on sporting goods — from gear reviews and buying guides
                to maintenance tips and product deep-dives. Whether you're shopping for a new glove,
                picking the right clubs, or learning how to care for your equipment, you'll find
                practical advice backed by hands-on experience.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" className="rounded-xl" data-testid="link-tss-blog">
                  <a href="https://www.twinseamsports.com/blogs/news" target="_blank" rel="noopener noreferrer">
                    Visit Twin Seam Sports Blog
                    <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button asChild variant="outline" className="rounded-xl" data-testid="link-tss-store">
                  <a href="https://www.twinseamsports.com" target="_blank" rel="noopener noreferrer">
                    Shop Twin Seam Sports
                    <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {articles.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </Card>
            ))}
          </div>
        ) : articles.data && articles.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {articles.data.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <div className="mt-3 text-sm font-semibold">No articles yet</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Check back soon for gear reviews and guides from Twin Seam Sports.
            </p>
            <Button asChild variant="outline" className="mt-4 rounded-xl" data-testid="link-blog-empty-cta">
              <a href="https://www.twinseamsports.com/blogs/news" target="_blank" rel="noopener noreferrer">
                Visit the Blog
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function ArticleCard({ article }: { article: BlogArticle }) {
  return (
    <Link href={`/app/blog/${article.slug}`}>
      <Card
        className={cn(
          "group cursor-pointer overflow-hidden transition-all duration-200",
          "hover-elevate",
        )}
        data-testid={`card-article-${article.slug}`}
      >
        {article.imageUrl && (
          <div className="relative h-48 overflow-hidden bg-muted">
            <img
              src={article.imageUrl}
              alt={article.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          </div>
        )}
        <div className="p-4 space-y-2">
          {article.publishedAt && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {article.publishedAt}
            </div>
          )}
          <h3 className="text-sm font-bold leading-snug line-clamp-2">
            {article.title}
          </h3>
          {article.excerpt && (
            <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3">
              {article.excerpt}
            </p>
          )}
          <div className="flex items-center gap-1 pt-1 text-xs font-semibold text-primary">
            Read article
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

function ArticleDetail() {
  const [, params] = useRoute("/app/blog/:slug");
  const slug = params?.slug ?? "";

  const article = useQuery<BlogArticle>({
    queryKey: ["/api/blog/articles", slug],
    enabled: !!slug,
  });

  if (article.isLoading) {
    return (
      <AppShell title="Loading...">
        <Card className="space-y-4 p-6">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      </AppShell>
    );
  }

  if (!article.data) {
    return (
      <AppShell title="Article not found">
        <Card className="p-8 text-center">
          <div className="text-sm text-muted-foreground">This article couldn't be loaded.</div>
          <Link href="/app/blog">
            <Button variant="outline" className="mt-4 rounded-xl">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blog
            </Button>
          </Link>
        </Card>
      </AppShell>
    );
  }

  const a = article.data;

  return (
    <AppShell
      title={a.title}
      subtitle={a.publishedAt ? `Published ${a.publishedAt}` : undefined}
      rightSlot={
        <Button asChild variant="outline" className="rounded-xl" data-testid="link-article-original">
          <a href={a.url} target="_blank" rel="noopener noreferrer">
            Read on Twin Seam Sports
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </a>
        </Button>
      }
    >
      <Seo
        title={`${a.title} | Twin Seam Blog`}
        description={a.excerpt || `Read "${a.title}" on the Twin Seam Sports blog.`}
        ogImage={a.imageUrl || undefined}
        ogType="article"
      />

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/app/blog">
            <Button variant="ghost" size="sm" className="rounded-xl" data-testid="link-back-blog">
              <ArrowLeft className="mr-1 h-4 w-4" />
              All Articles
            </Button>
          </Link>
          <Badge variant="secondary">Twin Seam Sports</Badge>
        </div>

        {a.imageUrl && (
          <Card className="overflow-hidden">
            <img
              src={a.imageUrl}
              alt={a.title}
              className="h-auto max-h-96 w-full object-cover"
              data-testid="img-article-hero"
            />
          </Card>
        )}

        <Card className="p-5 md:p-8">
          <article className="prose prose-sm dark:prose-invert max-w-none" data-testid="article-content">
            {a.content ? (
              a.content.split("\n\n").map((paragraph, i) => {
                const trimmed = paragraph.trim();
                if (!trimmed) return null;
                if (trimmed.startsWith("- ")) {
                  const items = trimmed.split("\n").filter((l) => l.startsWith("- "));
                  return (
                    <ul key={i} className="my-3 space-y-1.5 pl-4">
                      {items.map((item, j) => (
                        <li key={j} className="text-sm leading-relaxed text-foreground/90">
                          {item.replace(/^- /, "")}
                        </li>
                      ))}
                    </ul>
                  );
                }
                if (trimmed.length < 60 && !trimmed.includes(".")) {
                  return (
                    <h3 key={i} className="mt-6 mb-2 text-base font-bold text-foreground">
                      {trimmed}
                    </h3>
                  );
                }
                return (
                  <p key={i} className="my-2 text-sm leading-relaxed text-foreground/90">
                    {trimmed}
                  </p>
                );
              })
            ) : a.excerpt ? (
              <p className="text-sm leading-relaxed text-foreground/90">{a.excerpt}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Read the full article on Twin Seam Sports.
              </p>
            )}
          </article>

          <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Originally published on{" "}
              <a href="https://www.twinseamsports.com/blogs/news" className="font-semibold underline" target="_blank" rel="noopener noreferrer">
                twinseamsports.com
              </a>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button asChild variant="outline" className="rounded-xl" data-testid="link-article-read-original">
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  Read Original
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
              <Button asChild className="rounded-xl" data-testid="link-article-shop">
                <a href="https://www.twinseamsports.com" target="_blank" rel="noopener noreferrer">
                  Shop Twin Seam Sports
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default function Blog() {
  const [isDetail] = useRoute("/app/blog/:slug");
  return isDetail ? <ArticleDetail /> : <ArticleList />;
}
