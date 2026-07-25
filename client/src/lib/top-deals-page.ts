export type TopDealsCategorySummary = {
  slug?: string | null;
  name?: string | null;
  description?: string | null;
};

export function resolveTopDealsRouteSlug(
  matched: boolean,
  params?: { slug?: string | null } | null,
): string | null {
  if (!matched) return null;
  const slug = params?.slug?.trim();
  return slug || null;
}

export function resolveTopDealsCategory(
  responseCategory: TopDealsCategorySummary | null | undefined,
  categories: TopDealsCategorySummary[],
  slug: string,
): TopDealsCategorySummary {
  if (responseCategory?.name) return responseCategory;
  const listed = categories.find((category) => category.slug === slug);
  if (listed?.name) return listed;
  return {
    slug,
    name: slug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
  };
}
