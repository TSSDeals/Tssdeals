import { type ReactNode, type WheelEvent, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type HorizontalCarouselProps = {
  children: ReactNode;
  className?: string;
  trackClassName?: string;
  label: string;
  testId?: string;
};

export function HorizontalCarousel({
  children,
  className,
  trackClassName,
  label,
  testId,
}: HorizontalCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateControls = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScrollLeft(track.scrollLeft > 6);
    setCanScrollRight(track.scrollLeft < track.scrollWidth - track.clientWidth - 6);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    updateControls();
    track.addEventListener("scroll", updateControls, { passive: true });
    const resizeObserver = new ResizeObserver(updateControls);
    resizeObserver.observe(track);
    return () => {
      track.removeEventListener("scroll", updateControls);
      resizeObserver.disconnect();
    };
  }, [children, updateControls]);

  const scroll = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-carousel-card]");
    const distance = card ? card.offsetWidth + 16 : Math.max(320, track.clientWidth * 0.8);
    track.scrollBy({ left: direction * distance, behavior: "smooth" });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track || track.scrollWidth <= track.clientWidth) return;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      track.scrollBy({ left: event.deltaY, behavior: "auto" });
    }
  };

  const controlClass = cn(
    "absolute top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full",
    "border border-white/25 bg-slate-950/90 text-white shadow-xl backdrop-blur",
    "transition hover:scale-105 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
  );

  return (
    <div className={cn("relative", className)} aria-label={label}>
      <button
        type="button"
        aria-label={`Scroll ${label} left`}
        onClick={() => scroll(-1)}
        className={cn(controlClass, "left-2", !canScrollLeft && "pointer-events-none opacity-0")}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div
        ref={trackRef}
        onWheel={handleWheel}
        className={cn("scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3", trackClassName)}
        data-testid={testId}
      >
        {children}
      </div>
      <button
        type="button"
        aria-label={`Scroll ${label} right`}
        onClick={() => scroll(1)}
        className={cn(controlClass, "right-2", !canScrollRight && "pointer-events-none opacity-0")}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
