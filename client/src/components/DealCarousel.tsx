import { useRef, useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DealCard } from "./DealCard";

interface DealCarouselProps {
  deals: any[];
  sportId: string;
  sourceById: Map<string, any>;
  ourStoreId?: string | null;
}

export function DealCarousel({ deals, sportId, sourceById, ourStoreId }: DealCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateButtons = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateButtons();
    el.addEventListener("scroll", updateButtons, { passive: true });
    const ro = new ResizeObserver(updateButtons);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateButtons);
      ro.disconnect();
    };
  }, [updateButtons, deals]);

  const scrollBy = (dir: "left" | "right") => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-carousel-card]");
    const cardWidth = card ? card.offsetWidth + 12 : 312;
    el.scrollBy({ left: dir === "left" ? -cardWidth : cardWidth, behavior: "smooth" });
  };

  return (
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Left fade overlay */}
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-0 bottom-3 z-10 w-12 sm:w-16",
          "bg-gradient-to-r from-background to-transparent",
          "transition-opacity duration-200",
          canScrollLeft ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Left nav button — desktop only */}
      <button
        onClick={() => scrollBy("left")}
        aria-label="Scroll left"
        data-testid={`carousel-prev-${sportId}`}
        className={cn(
          "hidden sm:flex absolute left-2 top-1/2 -translate-y-4 z-20",
          "h-8 w-8 items-center justify-center rounded-full",
          "bg-background/95 border border-border shadow-md text-foreground",
          "transition-all duration-200 hover:bg-muted hover:scale-110 active:scale-95",
          canScrollLeft ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Scrollable track */}
      <div
        ref={trackRef}
        className="scrollbar-hide flex gap-3 overflow-x-auto scroll-smooth pb-3 px-4 sm:px-6 lg:px-8"
        style={{ scrollSnapType: "x mandatory" }}
        data-testid={`carousel-track-${sportId}`}
      >
        {deals.map((d: any, idx: number) => (
          <div
            key={d.id}
            data-carousel-card
            style={{ scrollSnapAlign: "start" }}
            className={cn(
              "w-[min(82vw,300px)] sm:w-72 lg:w-80 shrink-0 animate-float-in",
              idx === 0 ? "stagger-1" :
              idx === 1 ? "stagger-2" :
              idx === 2 ? "stagger-3" :
              idx === 3 ? "stagger-4" : "stagger-5"
            )}
          >
            <DealCard
              deal={d}
              featured={false}
              ourStore={ourStoreId ? d.sourceId === ourStoreId : Boolean(sourceById.get(d.sourceId)?.isOurStore)}
              sourceName={sourceById.get(d.sourceId)?.name}
              data-testid={`deal-${sportId}-${idx}`}
            />
          </div>
        ))}
      </div>

      {/* Right fade overlay */}
      <div
        className={cn(
          "pointer-events-none absolute right-0 top-0 bottom-3 z-10 w-12 sm:w-16",
          "bg-gradient-to-l from-background to-transparent",
          "transition-opacity duration-200",
          canScrollRight ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Right nav button — desktop only */}
      <button
        onClick={() => scrollBy("right")}
        aria-label="Scroll right"
        data-testid={`carousel-next-${sportId}`}
        className={cn(
          "hidden sm:flex absolute right-2 top-1/2 -translate-y-4 z-20",
          "h-8 w-8 items-center justify-center rounded-full",
          "bg-background/95 border border-border shadow-md text-foreground",
          "transition-all duration-200 hover:bg-muted hover:scale-110 active:scale-95",
          canScrollRight ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
