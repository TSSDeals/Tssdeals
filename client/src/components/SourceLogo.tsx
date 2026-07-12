import { getSourceLogoInfo } from "@/lib/source-logos";

function EbayLogo({ size = 16 }: { size?: number }) {
  const h = size;
  const w = Math.round(h * 2.5);
  return (
    <svg viewBox="0 0 300 120" width={w} height={h} aria-label="eBay" role="img">
      <text x="0" y="95" fontFamily="Arial Black, Arial, sans-serif" fontWeight="bold" fontSize="110">
        <tspan fill="#e53238">e</tspan>
        <tspan fill="#0064d2">b</tspan>
        <tspan fill="#f5af02">a</tspan>
        <tspan fill="#86b817">y</tspan>
      </text>
    </svg>
  );
}

function DicksLogo({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{ fontSize: size * 0.75, lineHeight: 1 }}
      className="font-black tracking-tight text-[#00703c] dark:text-emerald-400 whitespace-nowrap"
      aria-label="DICK'S Sporting Goods"
    >
      DICK'S
    </span>
  );
}

function GolfGalaxyLogo({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{ fontSize: size * 0.65, lineHeight: 1 }}
      className="font-bold tracking-tight text-[#003f72] dark:text-blue-400 whitespace-nowrap"
      aria-label="Golf Galaxy"
    >
      Golf Galaxy
    </span>
  );
}

export function SourceLogo({
  sourceId,
  size = 14,
  showName = false,
}: {
  sourceId: string;
  size?: number;
  showName?: boolean;
}) {
  const id = sourceId.toLowerCase();
  const info = getSourceLogoInfo(sourceId);

  if (id.includes("ebay")) {
    return (
      <span className="inline-flex items-center gap-1" data-testid="source-logo-ebay">
        <EbayLogo size={size} />
      </span>
    );
  }

  if (id.includes("dicks") || id === "cj-dicks-sporting-goods") {
    return (
      <span className="inline-flex items-center gap-1" data-testid="source-logo-dicks">
        <DicksLogo size={size} />
      </span>
    );
  }

  if (id.includes("golf-galaxy") || id === "cj-golf-galaxy") {
    return (
      <span className="inline-flex items-center gap-1" data-testid="source-logo-golf-galaxy">
        <GolfGalaxyLogo size={size} />
      </span>
    );
  }

  if (showName && info) {
    return (
      <span
        className="inline-flex items-center gap-1 font-semibold"
        style={{ color: info.color, fontSize: size * 0.75 }}
        data-testid={`source-logo-${id}`}
      >
        {info.name}
      </span>
    );
  }

  return null;
}
