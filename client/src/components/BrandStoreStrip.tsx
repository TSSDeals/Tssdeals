import fanaticsLogo from "../assets/images/fanatics-logo.png";
import mlbShopLogo from "../assets/images/mlb-shop-logo.png";
import amazonLogo from "@assets/image_1773061660117.png";
import dicksLogo from "@assets/image_1773061898646.png";
import academyLogo from "../assets/images/academy-logo.png";
import ebayLogo from "../assets/images/ebay-logo.svg";

interface BrandChip {
  name: string;
  color?: string;
}

interface StoreChip {
  name: string;
  logo?: string;
  logoClass?: string;
  color?: string;
}

const brands: BrandChip[] = [
  { name: "Wilson", color: "#c8102e" },
  { name: "DeMarini", color: "#001489" },
  { name: "Louisville Slugger", color: "#1a1a1a" },
  { name: "EvoShield", color: "#003087" },
  { name: "ATEC", color: "#222" },
  { name: "Luxilon", color: "#8b0000" },
  { name: "Rawlings", color: "#002d62" },
  { name: "Marucci", color: "#1b1b1b" },
  { name: "Mizuno", color: "#003580" },
  { name: "Hoka", color: "#002868" },
  { name: "Easton", color: "#c00" },
  { name: "Miken", color: "#1c1c1c" },
  { name: "Worth", color: "#00529b" },
  { name: "Nike", color: "#111" },
  { name: "Under Armour", color: "#1c1c1c" },
];

const stores: StoreChip[] = [
  { name: "eBay", logo: ebayLogo, logoClass: "h-5 w-auto" },
  { name: "Amazon", logo: amazonLogo, logoClass: "h-5 w-auto brightness-0 invert" },
  { name: "DICK'S Sporting Goods", logo: dicksLogo, logoClass: "h-5 w-auto" },
  { name: "Academy Sports", logo: academyLogo, logoClass: "h-4 w-auto brightness-0 invert" },
  { name: "Fanatics", logo: fanaticsLogo, logoClass: "h-4 w-auto brightness-0 invert" },
  { name: "MLB Shop", logo: mlbShopLogo, logoClass: "h-4 w-auto brightness-0 invert" },
  { name: "Golf Galaxy", color: "#003f72" },
  { name: "SidelineSwap", color: "#1a73e8" },
  { name: "Smash It Sports", color: "#0a3a8a" },
  { name: "RTIC Outdoors", color: "#1c1c1c" },
];

function MarqueeRow({
  label,
  children,
  speed = "animate-marquee",
}: {
  label: string;
  children: React.ReactNode;
  speed?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 w-14 text-right leading-tight">
        {label}
      </span>
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute left-0 top-0 h-full w-8 z-10 pointer-events-none bg-gradient-to-r from-background to-transparent" />
        <div className="absolute right-0 top-0 h-full w-8 z-10 pointer-events-none bg-gradient-to-l from-background to-transparent" />
        <div className={`flex gap-2 w-max ${speed}`}>
          {children}
          {children}
        </div>
      </div>
    </div>
  );
}

export function BrandStoreStrip() {
  const brandChips = brands.map((b) => (
    <span
      key={b.name}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white flex-shrink-0 whitespace-nowrap"
      style={{ backgroundColor: b.color ?? "#333" }}
    >
      {b.name}
    </span>
  ));

  const storeChips = stores.map((s) => (
    <span
      key={s.name}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 whitespace-nowrap"
      style={
        s.logo
          ? { backgroundColor: "#1c1c1c" }
          : { backgroundColor: s.color ?? "#333", color: "#fff" }
      }
    >
      {s.logo ? (
        <img src={s.logo} alt={s.name} className={s.logoClass} />
      ) : (
        <span className="text-white">{s.name}</span>
      )}
    </span>
  ));

  return (
    <div
      className="card-elevated rounded-2xl px-3 py-1 overflow-hidden"
      data-testid="brand-store-strip"
    >
      <MarqueeRow label="Brands" speed="animate-marquee-slow">
        {brandChips}
      </MarqueeRow>
      <div className="soft-divider h-px w-full" />
      <MarqueeRow label="Stores" speed="animate-marquee">
        {storeChips}
      </MarqueeRow>
    </div>
  );
}
