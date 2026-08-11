export type StorefrontSource = {
  id: string;
  name: string;
};

export function compactStorefrontSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function sourceStorefrontSlug(source: StorefrontSource): string {
  return compactStorefrontSlug(source.name || source.id);
}

export function findStorefrontSource<T extends StorefrontSource>(sources: T[], slug: string): T | undefined {
  const requested = compactStorefrontSlug(decodeURIComponent(slug));
  return sources.find((source) =>
    compactStorefrontSlug(source.id) === requested ||
    compactStorefrontSlug(source.name) === requested
  );
}

