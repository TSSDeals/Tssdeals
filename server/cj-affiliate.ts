import type { InsertDeal } from "@shared/schema";
import { classifyDealAttributes } from "./sub-filter-classifier";

const CJ_GRAPHQL_URL = "https://ads.api.cj.com/query";

interface CJAmountWithCurrency {
  amount: string;
  currency: string;
}

interface CJShoppingProduct {
  title: string;
  link: string;
  imageLink: string;
  price: CJAmountWithCurrency | null;
  salePrice: CJAmountWithCurrency | null;
  brand: string;
  condition: string;
  availability: string;
  id: string;
  catalogId: string;
  adId: string;
  advertiserName: string;
  description: string;
  gtin: string;
  mpn: string;
  productType: string[];
}

interface CJGraphQLResponse {
  data?: {
    shoppingProducts?: {
      totalCount: number;
      count: number;
      resultList: CJShoppingProduct[];
    };
  };
  errors?: Array<{ message: string }>;
}

interface CJSyncOptions {
  keywords?: string;
  sportId: string;
  equipmentTypeId: string;
  maxResults?: number;
  partnerIds?: string[];
}

export interface CJPartnerConfig {
  partnerId: string;
  name: string;
  sourceId: string;
  sportIds: string[];
  maxDeals?: number;
}

export const CJ_PARTNERS: CJPartnerConfig[] = [
  {
    partnerId: "4671299",
    name: "Baseball Savings (playbaseball.com)",
    sourceId: "playbaseball",
    sportIds: ["baseball", "fastpitch-softball", "slowpitch-softball"],
  },
  {
    partnerId: "15381986",
    name: "Velocity Outdoor / Crosman",
    sourceId: "cj-velocity-outdoor-crosman-benjamin-lasermax-game-face",
    sportIds: [],
  },
  {
    partnerId: "13695453",
    name: "Power Systems",
    sourceId: "cj-power-systems",
    sportIds: [],
  },
  {
    partnerId: "7346426",
    name: "Academy Sports + Outdoors",
    sourceId: "academy-sports",
    sportIds: [],
  },
  {
    partnerId: "6434431",
    name: "Alphard Golf",
    sourceId: "cj-alphard-golf",
    sportIds: ["golf"],
  },
  {
    partnerId: "7345657",
    name: "DICK'S Sporting Goods",
    sourceId: "dicks-sporting-goods",
    sportIds: [],
    maxDeals: 2000,
  },
  {
    partnerId: "5712137",
    name: "Easton",
    sourceId: "cj-easton",
    sportIds: ["baseball", "fastpitch-softball", "slowpitch-softball"],
  },
  {
    partnerId: "5033111",
    name: "FootJoy",
    sourceId: "cj-footjoy",
    sportIds: ["golf"],
  },
  {
    partnerId: "7349429",
    name: "Golf Galaxy",
    sourceId: "golf-galaxy",
    sportIds: ["golf"],
    maxDeals: 500,
  },
  {
    partnerId: "2193092",
    name: "Holabird Sports",
    sourceId: "cj-partner-2193092",
    sportIds: [],
  },
  {
    partnerId: "6809508",
    name: "Partner 6809508",
    sourceId: "cj-partner-6809508",
    sportIds: [],
  },
  {
    partnerId: "3058605",
    name: "Mountain Hardwear",
    sourceId: "cj-partner-3058605",
    sportIds: [],
  },
  {
    partnerId: "6668618",
    name: "Nathan Sports",
    sourceId: "cj-partner-6668618",
    sportIds: [],
  },
  {
    partnerId: "4942550",
    name: "NIKE",
    sourceId: "cj-partner-4942550",
    sportIds: [],
  },
  {
    partnerId: "565703",
    name: "Pine Meadow Golf",
    sourceId: "cj-partner-565703",
    sportIds: [],
  },
  {
    partnerId: "6530791",
    name: "Puma Golf / Cobra Golf",
    sourceId: "cj-partner-6530791",
    sportIds: [],
  },
  {
    partnerId: "6130947",
    name: "Partner 6130947",
    sourceId: "cj-partner-6130947",
    sportIds: [],
  },
  {
    partnerId: "5178287",
    name: "Rawlings",
    sourceId: "cj-partner-5178287",
    sportIds: [],
  },
  {
    partnerId: "7686132",
    name: "SWAG Golf",
    sourceId: "cj-partner-7686132",
    sportIds: [],
  },
  {
    partnerId: "7401394",
    name: "Titleist",
    sourceId: "cj-partner-7401394",
    sportIds: [],
  },
  {
    partnerId: "6209356",
    name: "United Sports Brands",
    sourceId: "cj-partner-6209356",
    sportIds: [],
  },
  {
    partnerId: "6809515",
    name: "Partner 6809515",
    sourceId: "cj-partner-6809515",
    sportIds: [],
  },
  {
    partnerId: "2061630",
    name: "SoccerGarage.com",
    sourceId: "soccergarage",
    sportIds: ["soccer"],
  },
];

const SPORT_KEYWORDS: Record<string, string[]> = {
  baseball: ["baseball bat", "baseball glove", "baseball helmet", "baseball cleats", "batting gloves"],
  "fastpitch-softball": ["fastpitch bat", "fastpitch glove", "softball cleats"],
  "slowpitch-softball": ["slowpitch bat", "slowpitch glove", "softball bat"],
  golf: ["golf driver", "golf irons", "golf putter", "golf wedge", "golf balls", "golf bag"],
  basketball: ["basketball shoes", "basketball", "basketball hoop"],
  lacrosse: ["lacrosse stick", "lacrosse helmet", "lacrosse gloves"],
  soccer: ["soccer cleats", "soccer ball", "shin guards soccer"],
  football: ["football helmet", "football cleats", "football gloves"],
  fishing: ["fishing rod", "fishing reel", "fishing lure"],
  volleyball: ["volleyball", "volleyball shoes", "volleyball knee pads"],
  wrestling: ["wrestling shoes", "wrestling singlet"],
  hockey: ["hockey stick", "hockey skates", "hockey helmet", "hockey gloves"],
  cycling: ["bicycle", "cycling helmet", "cycling shoes"],
  gymnastics: ["gymnastics leotard", "gymnastics grips"],
  cheerleading: ["cheerleading shoes", "cheerleading pompoms"],
  rugby: ["rugby ball", "rugby cleats", "rugby headgear"],
  swimming: ["swim goggles", "swim cap", "swimsuit competitive"],
  running: ["running shoes", "trail running shoes", "running shorts", "running socks"],
};

export async function searchCJProducts(
  apiKey: string,
  companyId: string,
  options: CJSyncOptions,
): Promise<CJShoppingProduct[]> {
  const limit = options.maxResults ?? 100;

  const filters: string[] = [`companyId: "${companyId}"`, `limit: ${limit}`];

  if (options.partnerIds?.length) {
    filters.push(`partnerIds: [${options.partnerIds.map(id => `"${id}"`).join(", ")}]`);
  }

  if (options.keywords) {
    filters.push(`keywords: ["${options.keywords.replace(/"/g, '\\"')}"]`);
  }

  const query = `{
    shoppingProducts(
      ${filters.join(",\n      ")}
    ) {
      totalCount
      count
      resultList {
        id
        adId
        title
        link
        imageLink
        price { amount currency }
        salePrice { amount currency }
        brand
        condition
        availability
        advertiserName
        catalogId
        description
        gtin
        mpn
        productType
      }
    }
  }`;

  const response = await fetch(CJ_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const text = await response.text();

  if (text.includes("Could not authenticate")) {
    throw new Error("CJ API authentication failed. Your token may be invalid or expired. Go to https://developers.cj.com/ → Authentication → Personal Access Tokens to generate a new token.");
  }

  if (text.includes("unable to complete your request")) {
    throw new Error("CJ API returned a server error. This typically means your account may not have Product Search (Product Feed) API access enabled, or CJ is experiencing service issues. Check https://developers.cj.com/ and ensure your publisher account has Product Feed API access. Contact dx@cj.com if the issue persists.");
  }

  if (!response.ok) {
    throw new Error(`CJ API error ${response.status}: ${text.slice(0, 300)}`);
  }

  let data: CJGraphQLResponse;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`CJ API returned unexpected response: ${text.slice(0, 200)}`);
  }

  if (data.errors?.length) {
    throw new Error(`CJ GraphQL error: ${data.errors.map(e => e.message).join(", ")}`);
  }

  return data.data?.shoppingProducts?.resultList ?? [];
}

export async function searchCJProductsPaginated(
  apiKey: string,
  companyId: string,
  options: CJSyncOptions & { offset?: number },
): Promise<{ products: CJShoppingProduct[]; totalCount: number }> {
  const limit = options.maxResults ?? 100;
  const offset = options.offset ?? 0;

  const filters: string[] = [
    `companyId: "${companyId}"`,
    `limit: ${limit}`,
    `offset: ${offset}`,
  ];

  if (options.partnerIds?.length) {
    filters.push(`partnerIds: [${options.partnerIds.map(id => `"${id}"`).join(", ")}]`);
  }

  if (options.keywords) {
    filters.push(`keywords: ["${options.keywords.replace(/"/g, '\\"')}"]`);
  }

  const query = `{
    shoppingProducts(
      ${filters.join(",\n      ")}
    ) {
      totalCount
      count
      resultList {
        id
        adId
        title
        link
        imageLink
        price { amount currency }
        salePrice { amount currency }
        brand
        condition
        availability
        advertiserName
        catalogId
        gtin
        mpn
        productType
      }
    }
  }`;

  const response = await fetch(CJ_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const text = await response.text();

  if (text.includes("Could not authenticate")) {
    throw new Error("CJ API authentication failed.");
  }

  if (!response.ok) {
    throw new Error(`CJ API error ${response.status}: ${text.slice(0, 300)}`);
  }

  let data: CJGraphQLResponse;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`CJ API returned unexpected response: ${text.slice(0, 200)}`);
  }

  if (data.errors?.length) {
    throw new Error(`CJ GraphQL error: ${data.errors.map(e => e.message).join(", ")}`);
  }

  return {
    products: data.data?.shoppingProducts?.resultList ?? [],
    totalCount: data.data?.shoppingProducts?.totalCount ?? 0,
  };
}

function parseCJPrice(price: CJAmountWithCurrency | null): number {
  if (!price || !price.amount) return 0;
  const cleaned = price.amount.replace(/[^0-9.]/g, "");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

const NON_BASEBALL_GLOVE_EXCLUSIONS = /golf|lacrosse|football|hockey|soccer|tennis|pickleball|boxing|ufc|mma|ski\b|skiing|fleece|north face|carhartt|columbia|body board|body glove|mechani[cx]|garden|cycling|bike|snowboard|workout|weight.?lift|tactical|shooting|hunt|winter|outdoor research|smartwool|seirus|gordini|spyder|hestra|dakine|burton|striker|clam outdoor|ice fish|taylormade|titleist|callaway|footjoy|top flite|cobra golf|srixon|ghost golf|glove it |warrior |stx |century.*mma|glovelo/i;

const EQUIPMENT_RULES: Record<string, Array<{ patterns: RegExp[]; eqId: string; exclude?: RegExp }>> = {
  baseball: [
    { patterns: [/batting glove/i], eqId: "bb-batting-gloves" },
    { patterns: [/\bglove\b/i, /\bmitt?\b/i], eqId: "bb-gloves", exclude: NON_BASEBALL_GLOVE_EXCLUSIONS },
    { patterns: [/\bbat\b/i, /\bbats\b/i, /bbcor/i], eqId: "bb-bats" },
    { patterns: [/\bcleat/i, /\bspike/i, /\bturf shoe/i], eqId: "bb-cleats" },
    { patterns: [/\bhelmet/i, /chest protector/i, /leg guard/i, /shin guard/i, /catcher.*gear/i, /\bcup\b/i, /face ?mask/i, /elbow guard/i], eqId: "bb-protective" },
    { patterns: [/\bball\b/i, /\bballs\b/i, /\bsoftball\b/i], eqId: "bb-balls" },
    { patterns: [/bat bag/i, /equipment bag/i, /\bbackpack\b/i, /\bduffel\b/i, /\btote\b/i], eqId: "bb-bags" },
    { patterns: [/\bshoe\b/i, /\bshoes\b/i, /\bjersey\b/i, /\bpant\b/i, /\bpants\b/i, /\buniform\b/i, /\bbelt\b/i, /\bsock/i, /\bslider/i, /\bjacket/i, /\bhoodie/i, /\bhat\b/i, /\bcap\b/i], eqId: "bb-shoes-apparel" },
    { patterns: [/\bnet\b/i, /tee\b.*stand/i, /batting tee/i, /pitching machine/i, /training/i, /\bcage\b/i, /rebounder/i, /\bweight/i], eqId: "bb-training" },
    { patterns: [/\bbase\b.*set/i, /home ?plate/i, /pitcher.*mound/i, /field.*marker/i, /\bcone/i], eqId: "bb-field-equipment" },
    { patterns: [/glove oil/i, /glove conditioner/i, /pine tar/i, /grip\b/i, /bat tape/i, /eye black/i], eqId: "bb-care-accessories" },
  ],
  "fastpitch-softball": [
    { patterns: [/batting glove/i], eqId: "fp-batting-gloves" },
    { patterns: [/\bglove\b/i, /\bmitt?\b/i], eqId: "fp-gloves" },
    { patterns: [/\bbat\b/i, /\bbats\b/i, /fastpitch/i], eqId: "fp-bats" },
    { patterns: [/\bcleat/i, /\bspike/i, /\bturf shoe/i], eqId: "fp-cleats" },
    { patterns: [/\bhelmet/i, /chest protector/i, /leg guard/i, /shin guard/i, /face ?mask/i, /elbow guard/i], eqId: "fp-protective" },
    { patterns: [/\bball\b/i, /\bballs\b/i], eqId: "fp-balls" },
    { patterns: [/bat bag/i, /equipment bag/i, /\bbackpack\b/i, /\bduffel\b/i], eqId: "fp-bags" },
    { patterns: [/\bshoe\b/i, /\bshoes\b/i, /\bjersey\b/i, /\bpant/i, /\buniform\b/i, /\bsock/i, /\bjacket/i, /\bhoodie/i], eqId: "fp-shoes-apparel" },
    { patterns: [/training/i, /pitching machine/i, /\bnet\b/i, /batting tee/i], eqId: "fp-training" },
  ],
  "slowpitch-softball": [
    { patterns: [/batting glove/i], eqId: "sp-batting-gloves" },
    { patterns: [/\bglove\b/i, /\bmitt?\b/i], eqId: "sp-gloves" },
    { patterns: [/\bbat\b/i, /\bbats\b/i, /slowpitch/i], eqId: "sp-bats" },
    { patterns: [/\bcleat/i, /\bspike/i, /\bturf shoe/i], eqId: "sp-cleats" },
    { patterns: [/\bhelmet/i, /face ?mask/i], eqId: "sp-protective" },
    { patterns: [/\bball\b/i, /\bballs\b/i], eqId: "sp-balls" },
    { patterns: [/bat bag/i, /equipment bag/i, /\bbackpack\b/i], eqId: "sp-bags" },
    { patterns: [/\bshoe\b/i, /\bshoes\b/i, /\bjersey\b/i, /\bpant/i, /\bsock/i], eqId: "sp-shoes-apparel" },
    { patterns: [/training/i, /\bnet\b/i, /batting tee/i], eqId: "sp-training" },
  ],
  golf: [
    { patterns: [/\bdriver\b/i, /\bdrivers\b/i], eqId: "golf-drivers" },
    { patterns: [/iron set/i, /\biron sets\b/i, /complete set/i], eqId: "golf-iron-sets" },
    { patterns: [/\biron\b/i, /\birons\b/i, /hybrid/i, /fairway wood/i, /wood\b/i], eqId: "golf-irons" },
    { patterns: [/\bputter\b/i, /\bputters\b/i], eqId: "golf-putters" },
    { patterns: [/\bwedge\b/i, /\bwedges\b/i, /sand wedge/i, /pitching wedge/i, /lob wedge/i, /gap wedge/i], eqId: "golf-wedges" },
    { patterns: [/golf ball/i, /\bballs?\b.*golf/i, /dozen.*ball/i], eqId: "golf-balls" },
    { patterns: [/golf bag/i, /cart bag/i, /stand bag/i, /carry bag/i, /staff bag/i, /travel bag/i], eqId: "golf-bags" },
    { patterns: [/golf shoe/i, /\bshoe\b/i, /\bshoes\b/i, /\bpolo\b/i, /golf shirt/i, /golf pant/i, /golf short/i, /\bglove\b/i, /\bhat\b/i, /\bvisor\b/i, /\bjacket\b/i, /\bapparel\b/i], eqId: "golf-shoes-apparel" },
    { patterns: [/training/i, /alignment/i, /putting mat/i, /launch monitor/i, /rangefinder/i, /swing/i], eqId: "golf-training" },
  ],
  basketball: [
    { patterns: [/\bball\b/i, /\bbasketball\b(?!.*shoe|.*hoop|.*net|.*pad|.*knee|.*bag)/i], eqId: "bk-balls" },
    { patterns: [/\bhoop\b/i, /\bbackboard\b/i, /\bnet\b/i, /\brim\b/i, /goal\b/i], eqId: "bk-hoops-nets" },
    { patterns: [/\bshoe\b/i, /\bshoes\b/i, /\bjersey\b/i, /\bshort/i, /\bsock/i, /\bheadband/i, /\bwristband/i, /\bapparel\b/i], eqId: "bk-shoes-apparel" },
    { patterns: [/knee pad/i, /ankle/i, /\bbrace\b/i, /\bsleeve\b/i, /protective/i, /mouthguard/i], eqId: "bk-protective" },
    { patterns: [/\bbag\b/i, /\bbackpack\b/i], eqId: "bk-bags" },
    { patterns: [/training/i, /\bcone/i, /agility/i, /dribble/i], eqId: "bk-training" },
  ],
  football: [
    { patterns: [/\bfootball\b(?!.*cleat|.*shoe|.*glove|.*helmet|.*pad|.*bag)/i, /\bball\b/i], eqId: "fb-balls" },
    { patterns: [/\bcleat/i, /\bshoe\b/i, /\bshoes\b/i, /\bjersey\b/i, /\bpant/i, /\bsock/i, /\bapparel\b/i], eqId: "fb-shoes-apparel" },
    { patterns: [/\bhelmet/i, /shoulder pad/i, /\bpad\b/i, /\bpads\b/i, /girdle/i, /rib protector/i, /mouthguard/i, /face ?mask/i, /chin strap/i, /\bvisor\b/i, /\bglove/i], eqId: "fb-protective" },
    { patterns: [/\bbag\b/i, /\bbackpack\b/i], eqId: "fb-bags" },
    { patterns: [/training/i, /\bcone/i, /agility/i, /sled/i, /blocking/i], eqId: "fb-training" },
  ],
  soccer: [
    { patterns: [/\bball\b/i, /\bballs\b/i, /soccer ball/i], eqId: "soc-balls" },
    { patterns: [/\bcleat/i, /\bshoe\b/i, /\bshoes\b/i, /\bboot\b/i, /\bboots\b/i, /\bjersey\b/i, /\bshort/i, /\bsock/i, /\bapparel\b/i, /\bglove/i], eqId: "soc-shoes-apparel" },
    { patterns: [/shin guard/i, /shin pad/i, /\bguard\b/i, /\bpad\b/i, /protective/i], eqId: "soc-protective" },
    { patterns: [/\bgoal\b/i, /\bnet\b/i], eqId: "soc-nets" },
    { patterns: [/\bbag\b/i, /\bbackpack\b/i], eqId: "soc-bags" },
    { patterns: [/training/i, /\bcone/i, /agility/i, /rebounder/i], eqId: "soc-training" },
  ],
  fishing: [
    { patterns: [/\brod\b/i, /\brods\b/i, /\bpole\b/i], eqId: "fish-rods" },
    { patterns: [/\breel\b/i, /\breels\b/i], eqId: "fish-reels" },
    { patterns: [/\blure\b/i, /\blures\b/i, /\bline\b/i, /\bhook/i, /\bjig\b/i, /\bbait\b/i, /\btackle\b/i, /sinker/i, /\bswivel/i, /\bspinner/i], eqId: "fish-lures-line" },
    { patterns: [/\bwader/i, /\bvest\b/i, /\bjacket\b/i, /\bboot\b/i, /\bhat\b/i, /\bglove/i, /\bshirt/i, /\bapparel\b/i], eqId: "fish-apparel" },
    { patterns: [/\bbag\b/i, /\bbox\b/i, /tackle box/i, /\bcase\b/i], eqId: "fish-bags" },
  ],
  lacrosse: [
    { patterns: [/\bstick\b/i, /\bsticks\b/i, /\bhead\b/i, /\bshaft\b/i], eqId: "lax-sticks" },
    { patterns: [/\bball\b/i, /\bballs\b/i], eqId: "lax-balls" },
    { patterns: [/\bhelmet/i, /\bglove/i, /\bpad\b/i, /\bpads\b/i, /shoulder pad/i, /arm pad/i, /rib pad/i, /goggles/i, /protective/i], eqId: "lax-protective" },
    { patterns: [/\bcleat/i, /\bshoe\b/i, /\bshoes\b/i, /\bjersey\b/i, /\bshort/i, /\bapparel\b/i], eqId: "lax-shoes-apparel" },
    { patterns: [/\bbag\b/i, /\bbackpack\b/i], eqId: "lax-bags" },
    { patterns: [/training/i, /rebounder/i, /\bnet\b/i, /\bgoal\b/i], eqId: "lax-training" },
  ],
  hockey: [
    { patterns: [/\bstick\b/i, /\bsticks\b/i, /\bblade\b/i], eqId: "hk-sticks" },
    { patterns: [/\bskate\b/i, /\bskates\b/i], eqId: "hk-skates" },
    { patterns: [/\bhelmet/i, /\bglove/i, /\bpad\b/i, /\bpads\b/i, /shin guard/i, /shoulder pad/i, /elbow pad/i, /protective/i, /\bvisor\b/i, /cage\b/i], eqId: "hk-protective" },
    { patterns: [/\bjersey\b/i, /\bsock/i, /\bpant/i, /\bapparel\b/i, /\bjacket/i], eqId: "hk-apparel" },
    { patterns: [/\bnet\b/i, /\bgoal\b/i], eqId: "hk-nets" },
    { patterns: [/\bbag\b/i, /\bbackpack\b/i], eqId: "hk-bags" },
    { patterns: [/training/i, /shooting pad/i, /puck\b/i], eqId: "hk-training" },
  ],
  volleyball: [
    { patterns: [/\bball\b/i, /\bballs\b/i, /volleyball(?!.*shoe|.*net|.*pad|.*knee|.*bag)/i], eqId: "vb-balls" },
    { patterns: [/\bnet\b/i, /\bpole/i, /\bantenna/i], eqId: "vb-nets" },
    { patterns: [/\bshoe\b/i, /\bshoes\b/i, /\bjersey\b/i, /\bshort/i, /\bsock/i, /\bapparel\b/i], eqId: "vb-shoes-apparel" },
    { patterns: [/knee pad/i, /\bpad\b/i, /\bpads\b/i, /\bsleeve\b/i, /\bbrace\b/i, /protective/i], eqId: "vb-protective" },
    { patterns: [/\bbag\b/i, /\bbackpack\b/i], eqId: "vb-bags" },
    { patterns: [/training/i, /\bcone/i, /agility/i], eqId: "vb-training" },
  ],
  running: [
    { patterns: [/\bshoe\b/i, /\bshoes\b/i, /\bsneaker/i, /\btrainer\b/i, /\btrainers\b/i], eqId: "run-shoes" },
    { patterns: [/\bshort\b/i, /\bshorts\b/i], eqId: "run-shorts" },
    { patterns: [/\bsock\b/i, /\bsocks\b/i], eqId: "run-socks" },
    { patterns: [/\bwatch\b/i, /\bgps\b/i, /garmin/i, /\bfitbit\b/i, /heart rate/i], eqId: "run-watches-tech" },
    { patterns: [/hydration/i, /water bottle/i, /\bflask\b/i, /\bcamelb/i], eqId: "run-hydration" },
    { patterns: [/\bbag\b/i, /\bbackpack\b/i, /\bvest\b/i, /\bwaist pack/i, /\bbelt\b.*pack/i, /\bfanny/i], eqId: "run-bags" },
    { patterns: [/\btight\b/i, /\btights\b/i, /\blegging/i, /\bjacket\b/i, /\bhoodie\b/i, /\btank\b/i, /\btee\b/i, /\bshirt\b/i, /\bbra\b/i, /\bcap\b/i, /\bhat\b/i, /\bvisor\b/i, /\bapparel\b/i, /\bpant\b/i, /\bpants\b/i], eqId: "run-apparel" },
    { patterns: [/\binsole/i, /\blace/i, /reflective/i, /headlamp/i, /armband/i, /\bsunglasses/i], eqId: "run-accessories" },
  ],
};

export function classifyEquipmentTypeByTitle(title: string, sportId: string, fallback: string): string {
  const rules = EQUIPMENT_RULES[sportId];
  if (!rules) return fallback;

  const lower = title.toLowerCase();
  for (const rule of rules) {
    if (rule.patterns.some((p) => p.test(lower))) {
      if (rule.exclude && rule.exclude.test(title)) {
        continue;
      }
      return rule.eqId;
    }
  }
  return fallback;
}

function buildCjTrackingUrl(merchantUrl: string): string {
  const cjPid = process.env.CJ_PROPERTY_ID || process.env.CJ_COMPANY_ID || "";
  if (!cjPid || !merchantUrl) return merchantUrl;
  if (merchantUrl.includes("anrdoezrs.net") || merchantUrl.includes("dpbolvw.net") || merchantUrl.includes("jdoqocy.com") || merchantUrl.includes("tkqlhce.com") || merchantUrl.includes("kqzyfj.com")) {
    return merchantUrl;
  }
  return `https://www.anrdoezrs.net/links/${cjPid}/type/dlg/${merchantUrl}`;
}

export function cjProductToDeal(
  product: CJShoppingProduct,
  sportId: string,
  equipmentTypeId: string,
  sourceIdOverride?: string,
): InsertDeal | null {
  const priceCents = parseCJPrice(product.price);
  const salePriceCents = parseCJPrice(product.salePrice);

  if (priceCents <= 0) return null;

  const effectivePrice = salePriceCents > 0 ? salePriceCents : priceCents;
  const msrp = priceCents;

  let percentOff: string | null = null;
  if (salePriceCents > 0 && salePriceCents < priceCents) {
    percentOff = (((msrp - effectivePrice) / msrp) * 100).toFixed(3);
  }

  const sourceId = sourceIdOverride || mapAdvertiserToSource(product.advertiserName || "cj-network");

  const cjCondition = (product.condition || "").toLowerCase();
  const condition: "new" | "preowned" =
    cjCondition === "used" || cjCondition === "refurbished" ? "preowned" : "new";

  const finalEquipmentTypeId = classifyEquipmentTypeByTitle(product.title || "", sportId, equipmentTypeId);
  const { subFilterId, dropWeight, sizeNumber } = classifyDealAttributes(product.title || "", finalEquipmentTypeId);

  return {
    sourceId,
    title: (product.title || "").slice(0, 200),
    brand: product.brand || null,
    url: buildCjTrackingUrl(product.link),
    imageUrl: product.imageLink || null,
    sportId,
    equipmentTypeId: finalEquipmentTypeId,
    subFilterId,
    dropWeight,
    sizeNumber,
    condition,
    currency: product.price?.currency || "USD",
    msrpCents: msrp,
    manufacturerMsrpCents: null,
    msrpSource: "retailer" as const,
    msrpVerified: false,
    priceCents: effectivePrice,
    percentOff,
    isBuyItNow: true,
    autoIncluded: false,
    autoIncludeRuleId: null,
    raw: {
      cjAdId: product.adId,
      cjProductId: product.id,
      cjCatalogId: product.catalogId,
      cjGtin: product.gtin,
      cjAdvertiser: product.advertiserName,
    },
  };
}

function mapAdvertiserToSource(advertiserName: string): string {
  const name = advertiserName.toLowerCase();
  const mapping: Record<string, string> = {
    "baseball savings": "playbaseball",
    "dick's": "dicks-sporting-goods",
    dicks: "dicks-sporting-goods",
    amazon: "amazon",
    walmart: "walmart",
    "academy sports": "academy-sports",
    academy: "academy-sports",
    rei: "rei",
    target: "target",
    scheels: "scheels",
    "sierra trading": "sierra-trading-post",
    sierra: "sierra-trading-post",
    eastbay: "eastbay",
    "finish line": "finish-line",
    "foot locker": "foot-locker",
    champs: "champs-sports",
    fanatics: "fanatics",
    "golf galaxy": "golf-galaxy",
    "pga tour superstore": "pga-tour-superstore",
    "2nd swing": "2nd-swing-golf",
    "rock bottom golf": "rock-bottom-golf",
    rawlings: "rawlings-direct",
    wilson: "wilson-direct",
    nike: "nike-direct",
    adidas: "adidas-direct",
    "under armour": "under-armour-direct",
    taylormade: "taylormade-direct",
    callaway: "callaway-direct",
    titleist: "titleist-direct",
    bauer: "bauer-direct",
    shimano: "shimano-direct",
    "new balance": "new-balance-direct",
    "power systems": "cj-power-systems",
    "velocity outdoor": "cj-velocity-outdoor-crosman-benjamin-lasermax-game-face",
    crosman: "cj-velocity-outdoor-crosman-benjamin-lasermax-game-face",
    soccergarage: "soccergarage",
    "soccer garage": "soccergarage",
  };

  for (const [key, sourceId] of Object.entries(mapping)) {
    if (name.includes(key)) return sourceId;
  }

  const fallbackId = advertiserName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `cj-${fallbackId}`;
}

export function getSportKeywords(): Record<string, string[]> {
  return SPORT_KEYWORDS;
}

export function getCJPartners(): CJPartnerConfig[] {
  return CJ_PARTNERS;
}
