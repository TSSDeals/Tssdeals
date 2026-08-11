import { useRoute } from "wouter";
import Deals from "@/pages/Deals";
import NotFound from "@/pages/not-found";
import { useSources } from "@/hooks/use-taxonomy";
import { findStorefrontSource } from "@/lib/source-storefront";

export default function SourceStorefront() {
  const [isEbay, ebayParams] = useRoute("/ebay/:seller");
  const [, sourceParams] = useRoute("/:sourceSlug");
  const sources = useSources();

  if (isEbay) {
    const requested = decodeURIComponent(ebayParams?.seller ?? "");
    if (!requested.trim()) return <NotFound />;
    return (
      <Deals
        storefront={{
          sourceId: "ebay",
          ebaySeller: requested,
          title: `${requested} on eBay`,
          description: `Browse current eBay listings from ${requested}. Filter by sport, product type, price, condition, brand, and more.`,
        }}
      />
    );
  }

  if (sources.isLoading) return null;
  const source = findStorefrontSource((sources.data ?? []) as any[], sourceParams?.sourceSlug ?? "");
  if (!source) return <NotFound />;

  return (
    <Deals
      storefront={{
        sourceId: source.id,
        title: source.name,
        description: `Browse current listings from ${source.name}. Filter by sport, product type, price, condition, brand, and more.`,
      }}
    />
  );
}
