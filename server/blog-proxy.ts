const BLOG_BASE_URL = "https://www.twinseamsports.com/blogs/news";
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface BlogArticle {
  slug: string;
  title: string;
  excerpt: string;
  imageUrl: string | null;
  publishedAt: string;
  url: string;
  content: string | null;
}

let articlesCache: { data: BlogArticle[]; ts: number } | null = null;
let articleContentCache: Map<string, { data: BlogArticle; ts: number }> = new Map();

export async function fetchBlogArticles(): Promise<BlogArticle[]> {
  if (articlesCache && Date.now() - articlesCache.ts < CACHE_TTL_MS) {
    return articlesCache.data;
  }

  try {
    const res = await fetch(BLOG_BASE_URL, {
      headers: { "User-Agent": "TwinSeamDeals/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    const articles = parseArticleListings(html);
    articlesCache = { data: articles, ts: Date.now() };
    return articles;
  } catch (e: any) {
    console.error("[blog-proxy] Failed to fetch articles:", e.message);
    return articlesCache?.data ?? [];
  }
}

export async function fetchArticleContent(slug: string): Promise<BlogArticle | null> {
  const cached = articleContentCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `${BLOG_BASE_URL}/${slug}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "TwinSeamDeals/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const article = parseArticlePage(html, slug);
    if (article) {
      articleContentCache.set(slug, { data: article, ts: Date.now() });
    }
    return article;
  } catch (e: any) {
    console.error("[blog-proxy] Failed to fetch article:", slug, e.message);
    return null;
  }
}

function parseArticleListings(html: string): BlogArticle[] {
  const articles: BlogArticle[] = [];

  const linkPattern = /href="\/blogs\/news\/([^"]+)"/g;
  const slugs = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const slug = match[1];
    if (slug && !slug.includes("tagged") && !slug.includes("#")) {
      slugs.add(slug);
    }
  }

  const imgPattern = /src="(?:https?:)?(?:\/\/)(www\.twinseamsports\.com\/cdn\/shop\/articles\/[^"?]+)/g;
  const images: string[] = [];
  while ((match = imgPattern.exec(html)) !== null) {
    images.push(`https://${match[1]}`);
  }

  const datePattern = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/g;
  const dates: string[] = [];
  while ((match = datePattern.exec(html)) !== null) {
    dates.push(match[0]);
  }

  let idx = 0;
  for (const slug of Array.from(slugs)) {
    const title = slug
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
      .replace(/\|/g, " | ")
      .replace(/\bAnd\b/g, "and")
      .replace(/\bA\b(?!\s+[A-Z])/g, "a")
      .replace(/\bThe\b(?!$)/gi, (m: string, offset: number) => (offset === 0 ? m : "the"))
      .replace(/\bOr\b/g, "or")
      .replace(/\bIn\b/g, "in")
      .replace(/\bOf\b/g, "of")
      .replace(/\bTo\b/g, "to");

    articles.push({
      slug,
      title,
      excerpt: "",
      imageUrl: images[idx] || null,
      publishedAt: dates[idx] || "",
      url: `${BLOG_BASE_URL}/${slug}`,
      content: null,
    });
    idx++;
  }

  return articles;
}

function parseArticlePage(html: string, slug: string): BlogArticle | null {
  let title = "";
  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
    html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1]).replace(/ [–—|] .*$/, "").trim();
  }

  let imageUrl: string | null = null;
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (ogImage) {
    imageUrl = ogImage[1];
  }
  if (!imageUrl) {
    const articleImg = html.match(/src="(?:https?:)?(?:\/\/)(www\.twinseamsports\.com\/cdn\/shop\/articles\/[^"?]+)/);
    if (articleImg) imageUrl = `https://${articleImg[1]}`;
  }
  if (imageUrl && imageUrl.startsWith("http://")) {
    imageUrl = imageUrl.replace("http://", "https://");
  }

  let description = "";
  const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
    html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (descMatch) {
    description = decodeHtmlEntities(descMatch[1]);
  }

  let publishedAt = "";
  const dateMatch = html.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/);
  if (dateMatch) publishedAt = dateMatch[0];

  const articleBodyMatch = html.match(/<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div[^>]*class="[^"]*(?:share|comment|related))/i);

  let content = "";
  const rteMatch = html.match(/<div[^>]*class="[^"]*rte[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (rteMatch) {
    content = cleanHtmlContent(rteMatch[1]);
  } else if (articleBodyMatch) {
    content = cleanHtmlContent(articleBodyMatch[1]);
  }

  if (!content) {
    const bodyContent = extractMainContent(html);
    if (bodyContent) content = bodyContent;
  }

  return {
    slug,
    title: title || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    excerpt: description,
    imageUrl,
    publishedAt,
    url: `${BLOG_BASE_URL}/${slug}`,
    content: content || description || null,
  };
}

function extractMainContent(html: string): string {
  const sections: string[] = [];

  const strongPattern = /<strong>([^<]+)<\/strong>/g;
  const pPattern = /<p[^>]*>([^<]*(?:<(?!\/p>)[^<]*)*)<\/p>/g;
  const liPattern = /<li[^>]*>([^<]*(?:<(?!\/li>)[^<]*)*)<\/li>/g;

  let m: RegExpExecArray | null;

  const textBlocks: { pos: number; text: string; type: string }[] = [];

  while ((m = pPattern.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text.length > 30 && !text.includes("Subscribe") && !text.includes("cookie") && !text.includes("Sign up")) {
      textBlocks.push({ pos: m.index, text, type: "p" });
    }
  }

  while ((m = liPattern.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text.length > 10) {
      textBlocks.push({ pos: m.index, text, type: "li" });
    }
  }

  textBlocks.sort((a, b) => a.pos - b.pos);

  let inList = false;
  for (const block of textBlocks) {
    if (block.type === "li") {
      if (!inList) sections.push("");
      sections.push(`- ${block.text}`);
      inList = true;
    } else {
      inList = false;
      sections.push(block.text);
    }
  }

  return sections.join("\n\n");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
}

function cleanHtmlContent(html: string): string {
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
