import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import fanaticsLogo from "../assets/images/fanatics-logo.png";
import mlbShopLogo from "../assets/images/mlb-shop-logo.png";
import amazonLogo from "@assets/image_1773061660117.png";
import dicksLogo from "@assets/image_1773061898646.png";
import academyLogo from "../assets/images/academy-logo.png";
import ebayLogo from "../assets/images/ebay-logo.svg";
import rticLogo from "../assets/images/rtic-logo.svg";

interface BannerSlide {
  id: string;
  href: string;
  external: boolean;
  gradient: string;
  logo: JSX.Element;
  tagline: string;
  subtitle: string;
  ctaText: string;
  dotColor: string;
  lightMode?: boolean;
}

const slides: BannerSlide[] = [
  {
    id: "ebay",
    href: "/api/banner-redirect/ebay",
    external: true,
    gradient: "from-[#111111] via-[#1c1c1c] to-[#111111]",
    logo: (
      <img src={ebayLogo} alt="eBay" className="h-10 w-auto object-contain flex-shrink-0" />
    ),
    tagline: "Sporting Goods on eBay",
    subtitle: "New & pre-owned gear at great prices",
    ctaText: "Shop eBay",
    dotColor: "bg-[#e53238]",
  },
  {
    id: "amazon",
    href: "/api/banner-redirect/amazon",
    external: true,
    gradient: "from-[#131921] via-[#232f3e] to-[#131921]",
    logo: (
      <img src={amazonLogo} alt="Amazon" className="h-12 w-auto object-contain flex-shrink-0" />
    ),
    tagline: "Sports & Outdoors",
    subtitle: "Top brands with fast Prime shipping",
    ctaText: "Shop Amazon",
    dotColor: "bg-[#ff9900]",
  },
  {
    id: "dicks",
    href: "/api/banner-redirect/dicks",
    external: true,
    gradient: "from-white via-white to-white",
    lightMode: true,
    logo: (
      <img src={dicksLogo} alt="DICK'S Sporting Goods" className="h-12 w-auto object-contain flex-shrink-0" />
    ),
    tagline: "Top Sporting Goods Retailer",
    subtitle: "Equipment, apparel & footwear for every sport",
    ctaText: "Shop Dick's",
    dotColor: "bg-[#00703c]",
  },
  {
    id: "fanatics",
    href: "/app/fanatics",
    external: false,
    gradient: "from-[#003087] via-[#00509d] to-[#003087]",
    logo: (
      <div className="flex items-center gap-3">
        <img src={fanaticsLogo} alt="Fanatics" className="h-8 w-auto object-contain brightness-0 invert" />
        <span className="text-xl font-bold text-white/40">|</span>
        <img src={mlbShopLogo} alt="MLB Shop" className="h-8 w-auto object-contain brightness-0 invert" />
      </div>
    ),
    tagline: "Official Licensed Gear",
    subtitle: "Jerseys, apparel & fan merchandise",
    ctaText: "Shop now",
    dotColor: "bg-[#003087]",
  },
  {
    id: "hoka",
    href: "/api/banner-redirect/hoka",
    external: true,
    gradient: "from-[#001a3d] via-[#002868] to-[#001a3d]",
    logo: (
      <svg viewBox="0 0 220 52" className="h-10 w-auto" aria-label="HOKA" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text
          x="2" y="42"
          fontFamily='"Arial Black", "Franklin Gothic Heavy", "Impact", sans-serif'
          fontWeight="900"
          fontSize="46"
          fill="#ffffff"
          letterSpacing="-1"
        >HOKA</text>
      </svg>
    ),
    tagline: "Performance Running Shoes",
    subtitle: "Cushioned comfort for every mile",
    ctaText: "Shop HOKA",
    dotColor: "bg-[#002868]",
  },
  {
    id: "golf-galaxy",
    href: "/api/banner-redirect/golf-galaxy",
    external: true,
    gradient: "from-[#003f72] via-[#00294d] to-[#001a33]",
    logo: (
      <img
        src="https://images.dickssportinggoods.com/assets/logo/prod/gg/logo.svg"
        alt="Golf Galaxy"
        className="h-8 w-auto object-contain brightness-0 invert flex-shrink-0"
      />
    ),
    tagline: "Your Golf Destination",
    subtitle: "Clubs, apparel & accessories from top brands",
    ctaText: "Shop Golf Galaxy",
    dotColor: "bg-[#003f72]",
  },
  {
    id: "academy",
    href: "/api/banner-redirect/academy",
    external: true,
    gradient: "from-[#cc0000] via-[#a80000] to-[#7a0000]",
    logo: (
      <img src={academyLogo} alt="Academy Sports + Outdoors" className="h-10 w-auto object-contain brightness-0 invert flex-shrink-0" />
    ),
    tagline: "Academy Sports + Outdoors",
    subtitle: "Gear, apparel & footwear for every sport",
    ctaText: "Shop Academy",
    dotColor: "bg-[#cc0000]",
  },
  {
    id: "rtic",
    href: "/api/banner-redirect/rtic",
    external: true,
    gradient: "from-[#111111] via-[#1c1c1c] to-[#111111]",
    logo: (
      <div className="flex flex-col items-start leading-none gap-0.5">
        <img src={rticLogo} alt="RTIC" className="h-8 w-auto object-contain brightness-0 invert flex-shrink-0" />
        <span className="text-[9px] font-bold tracking-[0.25em] text-[#F26522] uppercase">Outdoors</span>
      </div>
    ),
    tagline: "Save 10% at RTIC*",
    subtitle: "Coolers, drinkware & outdoor gear",
    ctaText: "Claim 10% Off",
    dotColor: "bg-[#F26522]",
  },
  {
    id: "smash-it-sports",
    href: "/api/banner-redirect/smash-it-sports",
    external: true,
    gradient: "from-[#0a3a8a] via-[#1565c0] to-[#0a3a8a]",
    logo: (
      <img src="/images/smash-it-sports-logo.jpeg" alt="Smash It Sports" className="h-12 w-12 object-cover rounded-lg flex-shrink-0" />
    ),
    tagline: "Bats, Gloves & Baseball Gear",
    subtitle: "Use code SISAFJUSTIN82 for 10% off site wide! Some exclusions apply.",
    ctaText: "Claim 10% Off",
    dotColor: "bg-[#e53935]",
  },
  {
    id: "wilson",
    href: "/api/banner-redirect/wilson",
    external: true,
    gradient: "from-[#1a0000] via-[#3a0000] to-[#1a0000]",
    logo: (
      <svg viewBox="0 0 180 48" className="h-10 w-auto" aria-label="Wilson" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="24" cy="24" rx="22" ry="22" fill="#e31837" />
        <text x="24" y="30" textAnchor="middle" fontFamily='"Arial", sans-serif' fontWeight="900" fontSize="22" fill="white">W</text>
        <text x="60" y="32" fontFamily='"Arial", sans-serif' fontWeight="700" fontSize="26" fill="white" letterSpacing="1">WILSON</text>
      </svg>
    ),
    tagline: "Wilson Baseball Gloves",
    subtitle: "Premium gloves, bats & equipment",
    ctaText: "Shop Wilson",
    dotColor: "bg-[#e31837]",
  },
  {
    id: "louisville-slugger",
    href: "/api/banner-redirect/louisville-slugger",
    external: true,
    gradient: "from-[#0a0a1a] via-[#14143a] to-[#0a0a1a]",
    logo: (
      <svg viewBox="0 0 240 52" className="h-10 w-auto" aria-label="Louisville Slugger" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="10" width="6" height="36" rx="3" fill="#c8102e" />
        <rect x="0" y="40" width="20" height="6" rx="3" fill="#c8102e" />
        <text x="30" y="27" fontFamily='"Arial", sans-serif' fontWeight="900" fontSize="13" fill="#c8102e" letterSpacing="0.5">LOUISVILLE</text>
        <text x="30" y="44" fontFamily='"Arial Black", "Arial", sans-serif' fontWeight="900" fontSize="18" fill="white" letterSpacing="1">SLUGGER</text>
      </svg>
    ),
    tagline: "Up to 50% Off Louisville Slugger",
    subtitle: "Bats, batting gloves & accessories",
    ctaText: "Shop Slugger",
    dotColor: "bg-[#c8102e]",
  },
  {
    id: "demarini",
    href: "/api/banner-redirect/demarini",
    external: true,
    gradient: "from-[#0d0d0d] via-[#1a1a1a] to-[#0d0d0d]",
    logo: (
      <svg viewBox="0 0 220 48" className="h-10 w-auto" aria-label="DeMarini" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="0,44 14,4 20,4 6,44" fill="#39b54a" />
        <text x="28" y="38" fontFamily='"Arial Black", "Impact", sans-serif' fontWeight="900" fontSize="30" fill="white" letterSpacing="-0.5" fontStyle="italic">DeMarini</text>
      </svg>
    ),
    tagline: "DeMarini Baseball & Softball",
    subtitle: "High-performance bats & gear",
    ctaText: "Shop DeMarini",
    dotColor: "bg-[#39b54a]",
  },
  {
    id: "evoshield",
    href: "/api/banner-redirect/evoshield",
    external: true,
    gradient: "from-[#001529] via-[#002a52] to-[#001529]",
    logo: (
      <svg viewBox="0 0 200 48" className="h-10 w-auto" aria-label="EvoShield" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 4 L22 4 L26 24 L22 44 L8 44 L4 24 Z" fill="#0066cc" />
        <text x="15" y="30" textAnchor="middle" fontFamily='"Arial", sans-serif' fontWeight="900" fontSize="10" fill="white">EVO</text>
        <text x="36" y="22" fontFamily='"Arial Black", "Arial", sans-serif' fontWeight="900" fontSize="16" fill="white" letterSpacing="0.5">EVO</text>
        <text x="36" y="41" fontFamily='"Arial Black", "Arial", sans-serif' fontWeight="900" fontSize="16" fill="#4da6ff" letterSpacing="0.5">SHIELD</text>
      </svg>
    ),
    tagline: "EvoShield Up to 50% Off",
    subtitle: "Protective gear, batting helmets & more",
    ctaText: "Shop EvoShield",
    dotColor: "bg-[#0066cc]",
  },
];

export function RetailerBanner() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);

  const next = useCallback(() => setCurrent((c) => (c + 1) % slides.length), []);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + slides.length) % slides.length), []);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [paused, next]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    isDragging.current = false;
    setPaused(true);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    if (Math.abs(e.clientX - dragStartX.current) > 8) {
      isDragging.current = true;
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const diff = e.clientX - dragStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff < 0) next(); else prev();
    }
    dragStartX.current = null;
    setPaused(false);
  }, [next, prev]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) {
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = false;
    }
  }, []);

  const slide = slides[current];
  const light = slide.lightMode;

  const btnClass = cn(
    "grid h-7 w-7 place-items-center rounded-full transition-colors flex-shrink-0",
    light ? "bg-[#00703c]/10 hover:bg-[#00703c]/20" : "bg-white/10 hover:bg-white/20"
  );

  const inner = (
    <div
      className={cn(
        "card-elevated animate-float-in overflow-hidden rounded-2xl bg-gradient-to-r shadow-lg hover-elevate cursor-pointer transition-all duration-500 select-none",
        slide.gradient,
        light && "border-2 border-[#00703c]",
        slide.id === "ebay" && "shadow-red-900/25",
        slide.id === "amazon" && "shadow-gray-900/30",
        slide.id === "dicks" && "shadow-emerald-900/25",
        slide.id === "fanatics" && "shadow-blue-900/25",
        slide.id === "hoka" && "shadow-indigo-900/25",
        slide.id === "golf-galaxy" && "shadow-blue-900/25",
        slide.id === "academy" && "shadow-red-900/25",
        slide.id === "rtic" && "shadow-orange-900/25",
        slide.id === "smash-it-sports" && "shadow-blue-900/40",
        slide.id === "wilson" && "shadow-red-900/40",
        slide.id === "louisville-slugger" && "shadow-red-900/30",
        slide.id === "demarini" && "shadow-green-900/30",
        slide.id === "evoshield" && "shadow-blue-900/30",
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { setPaused(false); dragStartX.current = null; }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { dragStartX.current = null; setPaused(false); }}
      onClick={handleClick}
      data-testid="retailer-banner"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2 sm:py-4 sm:gap-4 sm:px-5">
        <div className="flex items-center gap-3 min-w-0 sm:gap-4">
          <div className="flex-shrink-0">
            {slide.logo}
          </div>
          <div className={cn("hidden sm:block pl-4 border-l", light ? "border-[#00703c]/30" : "border-white/20")}>
            <div className={cn("text-sm font-semibold", light ? "text-[#00703c]" : "text-white")}>{slide.tagline}</div>
            <div className={cn("text-xs", light ? "text-gray-500" : "text-white/60")}>{slide.subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden md:flex items-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrent(i); }}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === current
                    ? cn("w-6", light ? "bg-[#00703c]" : "bg-white")
                    : cn("w-1.5", light ? "bg-[#00703c]/30 hover:bg-[#00703c]/50" : "bg-white/40 hover:bg-white/60"),
                )}
                aria-label={`Go to ${s.id}`}
                data-testid={`banner-dot-${s.id}`}
              />
            ))}
          </div>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); prev(); }}
            className={btnClass}
            aria-label="Previous"
            data-testid="banner-prev"
          >
            <ChevronLeft className={cn("h-4 w-4", light ? "text-[#00703c]" : "text-white")} />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); next(); }}
            className={btnClass}
            aria-label="Next"
            data-testid="banner-next"
          >
            <ChevronRight className={cn("h-4 w-4", light ? "text-[#00703c]" : "text-white")} />
          </button>
          <div className={cn("hidden sm:flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium backdrop-blur-sm", light ? "bg-[#00703c] text-white" : "bg-white/15 text-white")}>
            {slide.ctaText}
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>
      <div className="sm:hidden px-4 pb-2">
        <div className={cn("text-sm font-semibold leading-tight", light ? "text-[#00703c]" : "text-white")}>{slide.tagline}</div>
        <div className={cn("text-xs mt-0.5 leading-tight", light ? "text-gray-600" : "text-white/70")}>{slide.subtitle}</div>
      </div>
      <div className="flex md:hidden items-center justify-center gap-1.5 pb-3">
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrent(i); }}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === current
                ? cn("w-6", light ? "bg-[#00703c]" : "bg-white")
                : cn("w-1.5", light ? "bg-[#00703c]/30 hover:bg-[#00703c]/50" : "bg-white/40 hover:bg-white/60"),
            )}
            aria-label={`Go to ${s.id}`}
          />
        ))}
      </div>
    </div>
  );

  if (slide.external) {
    return (
      <a href={slide.href} target="_blank" rel="noopener noreferrer" data-testid={`banner-link-${slide.id}`}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={slide.href} data-testid={`banner-link-${slide.id}`}>
      {inner}
    </Link>
  );
}
