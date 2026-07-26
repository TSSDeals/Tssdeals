import { type FormEvent, type RefObject } from "react";
import { Camera, RefreshCcw, Search, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  SHOPPER_MEMORABILIA_SPORT_ID,
  curateShopperEquipmentTypes,
} from "@shared/equipment-groups";
import { SHOPPER_STARTER_SEARCHES } from "@shared/shopper-search-ux";

const BASEBALL_QUICK_CATEGORIES = curateShopperEquipmentTypes<
  { id: string; name: string; sportId: string }
>([], "baseball");

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
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(query);
  };

  return (
    <>
      <section
        className="search-hero animate-float-in overflow-hidden rounded-[1.75rem] border border-primary/20 p-5 shadow-xl shadow-primary/10 sm:p-7 lg:p-9"
        data-testid="search-hero"
      >
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/75 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Search the way parents and players talk
          </div>
          <h1 className="mx-auto text-3xl font-bold leading-[1.08] sm:text-4xl lg:text-5xl">
            <span className="block">Find the right gear.</span>
            <span className="block">Compare the real deal.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Type a model, size, drop, or throw hand. TwinSeam matches shopping shorthand such as 27/17, -10, LHT, and RHT.
          </p>
        </div>

        <form className="mt-6" onSubmit={submit} data-testid="hero-search-form">
          <Label htmlFor="hero-q" className="sr-only">Search sporting goods</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
              <Input
                id="hero-q"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Try “27/17 Louisville Supra”"
                autoComplete="off"
                enterKeyHint="search"
                className="ring-focus h-14 rounded-2xl border-primary/25 bg-background/95 pl-12 pr-12 text-base shadow-lg shadow-black/5 sm:h-16 sm:text-lg"
                data-testid="hero-search"
              />
              <button
                type="button"
                aria-label="Search by photo"
                title="Search by photo"
                disabled={photoSearching}
                onClick={() => photoInputRef.current?.click()}
                className="ring-focus absolute right-2.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
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
            <Button type="submit" className="ring-focus h-14 rounded-2xl px-7 text-base font-bold shadow-lg shadow-primary/20 sm:h-16" data-testid="hero-search-submit">
              <Search className="mr-2 h-5 w-5" />
              Search deals
            </Button>
          </div>
        </form>

        {(photoSearching || photoIdentified) && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <Sparkles className={cn("h-3.5 w-3.5", photoSearching && "animate-pulse")} />
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

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Starter searches</div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" data-testid="starter-searches">
              {SHOPPER_STARTER_SEARCHES.map((starter) => (
                <button
                  key={starter.query}
                  type="button"
                  onClick={() => onSearch(starter.query)}
                  className="ring-focus flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-background/80 px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background hover:shadow-md sm:min-h-14"
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
                    <span className="block text-xs font-bold">{starter.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{starter.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {recentSearches.length > 0 && (
            <div className="lg:max-w-[250px]" data-testid="recent-searches">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Recent on this device</div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide lg:flex-wrap">
                {recentSearches.map((recent) => (
                  <button
                    key={recent}
                    type="button"
                    onClick={() => onSearch(recent)}
                    className="ring-focus min-h-10 shrink-0 rounded-full border border-border bg-background/70 px-3 text-xs font-semibold hover:border-primary/40"
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
        <div className="mb-3">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">Shop baseball</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">A concise equipment menu—no global taxonomy clutter.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {BASEBALL_QUICK_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onCategory("baseball", category.id)}
              className="ring-focus group relative min-h-14 rounded-2xl overflow-hidden border border-border bg-card px-3 py-3 text-left text-sm font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md sm:min-h-20"
              data-testid={`quick-category-${category.id}`}
            >
              <span className={cn("relative z-10 block max-w-[70%]", categoryImages[category.id] && "drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]")}>
                {category.name}
              </span>
              {categoryImages[category.id] && (
                <>
                  <span className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-card via-card/85 to-transparent" />
                  <img
                    src={categoryImages[category.id]}
                    alt=""
                    loading="lazy"
                    className="absolute right-1 top-1/2 h-[72px] w-[72px] -translate-y-1/2 object-contain opacity-90 transition-transform group-hover:scale-105"
                  />
                </>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onCategory(SHOPPER_MEMORABILIA_SPORT_ID, "all")}
            className="ring-focus min-h-14 rounded-2xl border border-border bg-card px-3 py-3 text-left text-sm font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md sm:min-h-20"
            data-testid="browse-sport-memorabilia"
          >
            Memorabilia
          </button>
        </div>
      </section>
    </>
  );
}
