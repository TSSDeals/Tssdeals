import { type FormEvent, type RefObject } from "react";
import { Camera, RefreshCcw, Search, ShieldCheck, Sparkles, TrendingDown, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  SHOPPER_MEMORABILIA_SPORT_ID,
  curateShopperEquipmentTypes,
} from "@shared/equipment-groups";
import { SHOPPER_STARTER_SEARCHES } from "@shared/shopper-search-ux";

const BASEBALL_QUICK_CATEGORIES = curateShopperEquipmentTypes<
  { id: string; name: string; sportId: string }
>([], "baseball");

const GOLF_QUICK_CATEGORIES = curateShopperEquipmentTypes<
  { id: string; name: string; sportId: string }
>([], "golf");

const BASEBALL_CATEGORY_IMAGE_FALLBACKS: Record<string, string> = {
  "bb-bats": "/images/products/bbcor-bat-composite.png",
  "bb-gloves": "/images/products/wilson-a2000-glove.png",
  "bb-cleats": "/images/products/baseball-cleats.png",
  "bb-training": "/images/products/pitching-machine.png",
};

const GOLF_CATEGORY_IMAGE_FALLBACKS: Record<string, string> = {
  "golf-drivers": "/images/products/golf-driver.png",
  "golf-iron-sets": "/images/products/golf-iron-set.png",
  "golf-wedges": "/images/products/golf-wedge.png",
};

export function DealsSearchHero({
  query,
  recentSearches,
  photoSearching,
  photoIdentified,
  photoInputRef,
  onQueryChange,
  onSearch,
  onPhotoSearch,
  onClearPhoto,
  onCategory,
  starterImages = {},
  categoryImages = {},
  sports = [],
}: {
  query: string;
  recentSearches: string[];
  photoSearching: boolean;
  photoIdentified: string | null;
  photoInputRef: RefObject<HTMLInputElement>;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  onPhotoSearch: (file: File) => void;
  onClearPhoto: () => void;
  onCategory: (sportId: string, equipmentTypeId: string) => void;
  starterImages?: Record<string, string>;
  categoryImages?: Record<string, string>;
  sports?: Array<{ id: string; name: string }>;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(query);
  };

  return (
    <>
      <section
        className="search-hero animate-float-in overflow-hidden rounded-[2rem] border border-primary/30 p-5 shadow-2xl shadow-black/30 sm:p-8 lg:p-10"
        data-testid="search-hero"
      >
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-primary sm:text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            Smarter gear shopping starts here
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.035em] sm:text-5xl lg:text-6xl">
            <span className="block">Find the right gear.</span>
            <span className="mt-1 block text-primary">Pay the right price.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base lg:text-lg">
            Search baseball and softball equipment across trusted retailers in one place. Compare deals by model, size, drop, throw hand, condition, and more.
          </p>
        </div>

        <form className="mx-auto mt-7 max-w-5xl" onSubmit={submit} data-testid="hero-search-form">
          <Label htmlFor="hero-q" className="sr-only">Search sporting goods</Label>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary sm:left-5 sm:h-6 sm:w-6" />
              <Input
                id="hero-q"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Try “27/17 Louisville Supra”"
                autoComplete="off"
                enterKeyHint="search"
                className="ring-focus h-14 rounded-2xl border-white/15 bg-background/95 pl-12 pr-12 text-base font-semibold shadow-xl shadow-black/20 sm:h-[4.5rem] sm:pl-14 sm:text-lg"
                data-testid="hero-search"
              />
              <button
                type="button"
                aria-label="Search by photo"
                title="Search by photo"
                disabled={photoSearching}
                onClick={() => photoInputRef.current?.click()}
                className="ring-focus absolute right-2.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50 sm:right-3.5 sm:h-11 sm:w-11"
                data-testid="button-photo-search"
              >
                {photoSearching ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onPhotoSearch(file);
                }}
                data-testid="input-photo-file"
              />
            </div>
            <Button type="submit" className="ring-focus h-14 rounded-2xl px-8 text-base font-black shadow-xl shadow-primary/25 sm:h-[4.5rem] sm:px-9" data-testid="hero-search-submit">
              <Search className="mr-2 h-5 w-5" />
              Search gear
            </Button>
          </div>
        </form>

        <div className="mx-auto mt-4 flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground sm:text-xs">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Trusted retailers</span>
          <span className="inline-flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-primary" /> Price-first comparison</span>
          <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> New + preowned</span>
        </div>

        {(photoSearching || photoIdentified) && (
          <div className="mx-auto mt-3 flex max-w-5xl items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <Sparkles className={cn("h-3.5 w-3.5 text-primary", photoSearching && "animate-pulse")} />
            <span>{photoSearching ? "Analyzing photo…" : photoIdentified}</span>
            {photoIdentified && !photoSearching && (
              <button
                type="button"
                aria-label="Clear photo search"
                onClick={onClearPhoto}
                className="ring-focus rounded-lg p-1 hover:bg-muted"
                data-testid="button-clear-photo-search"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="mx-auto mt-6 grid max-w-5xl gap-4 border-t border-white/10 pt-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Popular searches</div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" data-testid="starter-searches">
              {SHOPPER_STARTER_SEARCHES.map((starter) => (
                <button
                  key={starter.query}
                  type="button"
                  onClick={() => onSearch(starter.query)}
                  className="ring-focus flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-background/70 px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-background hover:shadow-lg sm:min-h-14"
                  data-testid={`starter-${starter.query.replace(/\W+/g, "-").toLowerCase()}`}
                >
                  {starterImages[starter.query] && (
                    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/70 bg-white">
                      <img
                        src={starterImages[starter.query]}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain p-0.5"
                      />
                    </span>
                  )}
                  <span>
                    <span className="block text-xs font-black">{starter.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{starter.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {recentSearches.length > 0 && (
            <div className="lg:max-w-[250px]" data-testid="recent-searches">
              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Recent on this device</div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide lg:flex-wrap">
                {recentSearches.map((recent) => (
                  <button
                    key={recent}
                    type="button"
                    onClick={() => onSearch(recent)}
                    className="ring-focus min-h-10 shrink-0 rounded-full border border-white/10 bg-background/70 px-3 text-xs font-bold hover:border-primary/50"
                  >
                    {recent}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="animate-float-in" data-testid="baseball-category-browser">
        <div className="mb-5 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="category-browser-eyebrow">Start with the game</div>
            <h2 className="category-browser-title">Shop baseball</h2>
            <p className="category-browser-description">Choose the gear you need and get straight to relevant listings.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {BASEBALL_QUICK_CATEGORIES.map((category) => (
            (() => {
              const categoryImage = categoryImages[category.id]
                ?? BASEBALL_CATEGORY_IMAGE_FALLBACKS[category.id];
              return (
            <button
              key={category.id}
              type="button"
              onClick={() => onCategory("baseball", category.id)}
              className="category-tile ring-focus group"
              data-testid={`quick-category-${category.id}`}
            >
              <span className={cn("category-tile-label", categoryImage && "category-tile-label-with-image")}>
                {category.name}
              </span>
              {categoryImage && (
                <span className="category-tile-image-frame" aria-hidden="true">
                  <img
                    src={categoryImage}
                    alt=""
                    loading="lazy"
                    className="category-tile-image"
                  />
                </span>
              )}
            </button>
              );
            })()
          ))}
          <button
            type="button"
            onClick={() => onCategory(SHOPPER_MEMORABILIA_SPORT_ID, "all")}
            className="category-tile ring-focus group"
            data-testid="browse-sport-memorabilia"
          >
            <span className="category-tile-label">Memorabilia</span>
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-border bg-card/75 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-black">Shopping another sport?</div>
            <div className="text-xs text-muted-foreground">Pick a sport and TSSDeals will narrow the equipment choices for you.</div>
          </div>
          <Select onValueChange={(sportId) => onCategory(sportId, "all")}>
            <SelectTrigger className="min-h-11 w-full rounded-xl bg-background sm:w-[260px]" data-testid="other-sports-select">
              <SelectValue placeholder="Select a sport" />
            </SelectTrigger>
            <SelectContent>
              {sports
                .filter((sport) => sport.id !== "baseball" && sport.id !== SHOPPER_MEMORABILIA_SPORT_ID)
                .map((sport) => (
                  <SelectItem key={sport.id} value={sport.id}>{sport.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="animate-float-in" data-testid="golf-category-browser">
        <div className="mb-5 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="category-browser-eyebrow">Next on the tee</div>
            <h2 className="category-browser-title">Shop golf</h2>
            <p className="category-browser-description">Compare the clubs and course essentials golfers actually shop for.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
          {GOLF_QUICK_CATEGORIES.map((category) => {
            const categoryImage = categoryImages[category.id]
              ?? GOLF_CATEGORY_IMAGE_FALLBACKS[category.id];
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => onCategory("golf", category.id)}
                className="category-tile ring-focus group"
                data-testid={`quick-category-${category.id}`}
              >
                <span className={cn("category-tile-label", categoryImage && "category-tile-label-with-image")}>
                  {category.name}
                </span>
                {categoryImage && (
                  <span className="category-tile-image-frame" aria-hidden="true">
                    <img
                      src={categoryImage}
                      alt=""
                      loading="lazy"
                      className="category-tile-image"
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
