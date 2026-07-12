import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Seo from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Tag } from "lucide-react";

interface CampaignData {
  slug: string;
  retailerUrl: string;
  title: string | null;
  writeup: string | null;
  images: string[];
}

export default function DealBlastPage() {
  const [, params] = useRoute("/d/:slug");
  const slug = params?.slug;
  const [activeImage, setActiveImage] = useState(0);

  const { data, isLoading, error } = useQuery<CampaignData>({
    queryKey: ["/api/campaign", slug],
    enabled: Boolean(slug),
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <Seo title="Deal not found | TSSDeals" noindex />
        <h1 className="text-2xl font-bold mb-2" data-testid="text-notfound-title">Deal not found</h1>
        <p className="text-muted-foreground mb-6">This deal link may have expired or been removed.</p>
        <Button asChild data-testid="link-browse-deals">
          <a href="/deals">Browse all deals</a>
        </Button>
      </div>
    );
  }

  const title = data.title || "Today's Featured Deal";
  const images = data.images || [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
      <Seo
        title={`${title} | TSSDeals`}
        description={data.writeup || "A hand-picked sporting goods deal from Twin Seam Sports."}
        ogImage={images[0]}
        ogType="product"
      />

      <div className="flex items-center gap-2 text-sm text-primary font-medium mb-3">
        <Tag className="h-4 w-4" />
        <span data-testid="text-deal-badge">Featured Deal from Twin Seam Sports</span>
      </div>

      <h1 className="text-2xl md:text-3xl font-bold mb-6" data-testid="text-deal-title">{title}</h1>

      {images.length > 0 && (
        <Card className="overflow-hidden mb-6">
          <div className="bg-muted flex items-center justify-center">
            <img
              src={images[activeImage]}
              alt={title}
              className="max-h-[28rem] w-full object-contain"
              data-testid="img-deal-main"
            />
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 p-3 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={img}
                  onClick={() => setActiveImage(i)}
                  className={`h-16 w-16 flex-shrink-0 rounded-md border overflow-hidden ${
                    i === activeImage ? "ring-2 ring-primary" : "opacity-70"
                  }`}
                  data-testid={`button-thumb-${i}`}
                >
                  <img src={img} alt={`${title} ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {data.writeup && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="whitespace-pre-line leading-relaxed" data-testid="text-deal-writeup">
              {data.writeup}
            </p>
          </CardContent>
        </Card>
      )}

      <Button asChild size="lg" className="w-full" data-testid="button-shop-deal">
        <a href={data.retailerUrl} target="_blank" rel="noopener noreferrer nofollow">
          Shop This Deal
          <ExternalLink className="ml-2 h-4 w-4" />
        </a>
      </Button>

      <p className="text-center text-xs text-muted-foreground mt-4">
        Prices and availability are set by the retailer and may change at any time.
      </p>

      <div className="text-center mt-8">
        <a href="/deals" className="text-sm text-primary hover:underline" data-testid="link-more-deals">
          See more deals →
        </a>
      </div>
    </div>
  );
}
