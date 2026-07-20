import { eq, isNull, and, isNotNull, inArray } from "drizzle-orm";
import { db } from "./db";
import { deals } from "@shared/schema";
import { BASEBALL_BAT_GROUP_IDS } from "../shared/equipment-groups";

interface SubFilterRule {
  subFilterId: string;
  patterns: RegExp[];
  excludePatterns?: RegExp[];
}

interface EquipmentSubFilterConfig {
  equipmentTypeIds: string[];
  rules: SubFilterRule[];
}

const GLOVE_RULES: SubFilterRule[] = [
  {
    subFilterId: "first-base",
    patterns: [/first\s*base/i, /1st\s*base/i, /\b1b\b/i, /first\s*baseman/i],
  },
  {
    subFilterId: "catchers",
    patterns: [/catcher['']?s?\b/i, /catching\s*(mitt|glove)/i, /\bcm\d/i],
    excludePatterns: [/catcher['']?s?\s*(gear|set|kit|helmet|mask|chest|leg|shin|bag|equipment)/i],
  },
  {
    subFilterId: "pitcher",
    patterns: [/\bpitcher['']?s?\b/i, /\bpitching\b/i, /\bpit\s*glove/i],
    excludePatterns: [/pitching\s*(machine|net|screen|mound|rubber)/i],
  },
  {
    subFilterId: "outfield",
    patterns: [/outfield/i, /\bof\s*glove/i, /\bof\s*mitt/i, /\b(12\.75|13|12\s*3\/4)[""\s]*(?:inch|in\.?|")\b.*(?:glove|mitt)/i],
  },
  {
    subFilterId: "infield",
    patterns: [/infield/i, /\bif\s*glove/i, /shortstop/i, /\bss\s*glove/i, /second\s*base/i, /2nd\s*base/i, /third\s*base/i, /3rd\s*base/i, /middle\s*infield/i],
  },
  {
    subFilterId: "training",
    patterns: [/training\s*(glove|mitt)/i, /practice\s*(glove|mitt)/i, /pancake\s*(glove|mitt)/i],
  },
];

const BAT_RULES: SubFilterRule[] = [
  {
    subFilterId: "wood",
    patterns: [/\bwood\b/i, /\bmaple\b/i, /\bash\b/i, /\bbirch\b/i, /\bbamboo\b/i, /\bfungo\b/i],
    excludePatterns: [/wood\s*bat\s*bag/i],
  },
  {
    subFilterId: "alloy",
    patterns: [/\balloy\b/i, /\baluminum\b/i, /\bmetal\b/i],
  },
  {
    subFilterId: "composite",
    patterns: [/\bcomposite\b/i, /\bhybrid\b/i, /\btwo[\s-]?piece\b/i, /\b2[\s-]?piece\b/i],
  },
  {
    subFilterId: "bbcor",
    patterns: [/\bbbcor\b/i],
  },
  {
    subFilterId: "usssa",
    patterns: [/\busssa\b/i],
  },
  {
    subFilterId: "usa",
    patterns: [/\busa\s*bat\b/i, /\busa\s*stamp/i, /\busa\s*certified/i, /\busa\s*approved/i],
  },
];

const PROTECTIVE_BASEBALL_RULES: SubFilterRule[] = [
  {
    subFilterId: "helmets",
    patterns: [/\bhelmet/i, /\bbatting\s*helm/i],
  },
  {
    subFilterId: "chest-protectors",
    patterns: [/\bchest\s*protect/i, /\bchest\s*guard/i, /\bbody\s*protect/i],
  },
  {
    subFilterId: "leg-guards",
    patterns: [/\bleg\s*guard/i, /\bshin\s*guard/i, /\bshin\s*pad/i],
  },
  {
    subFilterId: "face-masks",
    patterns: [/\bface\s*mask/i, /\bface\s*guard/i, /\bcatcher.*mask/i],
  },
  {
    subFilterId: "elbow-guards",
    patterns: [/\belbow\s*(guard|pad|protect)/i, /\barm\s*(guard|pad|protect)/i],
  },
  {
    subFilterId: "sliding-gear",
    patterns: [/\bsliding\b/i, /\bslide\s*short/i],
  },
];

const TRAINING_BASEBALL_RULES: SubFilterRule[] = [
  {
    subFilterId: "pitching-machines",
    patterns: [/\bpitching\s*machine/i, /\bjugs\b/i, /\bhack\s*attack/i],
  },
  {
    subFilterId: "batting-tees",
    patterns: [/\bbatting\s*tee/i, /\btee\s*ball/i, /\bt[\s-]?ball/i],
    excludePatterns: [/\bt[\s-]?shirt/i],
  },
  {
    subFilterId: "batting-cages",
    patterns: [/\bbatting\s*cage/i, /\bcage\s*net/i],
  },
  {
    subFilterId: "nets-screens",
    patterns: [/\bbatting\s*net/i, /\bpitching\s*net/i, /\bpractice\s*net/i, /\bl[\s-]?screen/i, /\bpitch[\s-]?back/i, /\brebounder/i, /\bprotective\s*screen/i, /\bhitting\s*net/i],
  },
  {
    subFilterId: "weighted-balls",
    patterns: [/\bweighted\s*ball/i, /\bplyo\s*ball/i, /\bsand\s*ball/i],
  },
  {
    subFilterId: "radar-tech",
    patterns: [/\bradar\b/i, /\bspeed\s*gun/i, /\brapsodo/i, /\bblast\s*motion/i, /\bswing\s*track/i, /\bpocket\s*radar/i],
  },
];

const BALL_BASEBALL_RULES: SubFilterRule[] = [
  {
    subFilterId: "game-balls",
    patterns: [/\bgame\s*ball/i, /\bofficial\b/i, /\brolb/i, /\bromlb/i, /\bleague\s*ball/i],
  },
  {
    subFilterId: "practice-balls",
    patterns: [/\bpractice\b/i, /\bbucket\b/i, /\bdozen\b/i, /\bbulk\b/i, /\bcase\b/i],
  },
  {
    subFilterId: "training-balls",
    patterns: [/\btraining\b/i, /\breduced\s*injury/i, /\bsafety\b/i, /\bincredib/i, /\bwiffle/i, /\bplastic\b/i],
  },
];

const CLEAT_RULES: SubFilterRule[] = [
  {
    subFilterId: "metal",
    patterns: [/\bmetal\s*cleat/i, /\bmetal\s*spike/i],
  },
  {
    subFilterId: "molded",
    patterns: [/\bmolded\b/i, /\brubber\s*cleat/i, /\brubber\s*spike/i],
  },
  {
    subFilterId: "turf",
    patterns: [/\bturf\b/i, /\bindoor\b/i, /\btrainer\b/i],
    excludePatterns: [/\bturf\s*field/i],
  },
];

const GOLF_DRIVER_RULES: SubFilterRule[] = [
  {
    subFilterId: "mini",
    patterns: [/\bmini\s*driver/i],
  },
  {
    subFilterId: "adjustable",
    patterns: [/\badjustable\s*(driver|loft|hosel)/i],
  },
  {
    subFilterId: "standard",
    patterns: [/\b460\s*cc/i, /\b460cc/i],
    excludePatterns: [/\bheadcover/i, /\bcover\b/i, /\bwrench\b/i],
  },
];

const GOLF_IRON_RULES: SubFilterRule[] = [
  {
    subFilterId: "blade",
    patterns: [/\bblade\b/i, /\bforged\b/i, /\bmuscle[\s-]?back/i],
  },
  {
    subFilterId: "cavity-back",
    patterns: [/\bcavity[\s-]?back/i, /\bgame[\s-]?improve/i],
  },
  {
    subFilterId: "players-distance",
    patterns: [/\bplayers?\s*distance/i, /\bhot\s*metal/i],
  },
];

const GOLF_WEDGE_RULES: SubFilterRule[] = [
  {
    subFilterId: "sand",
    patterns: [/\bsand\s*wedge/i, /\b56\s*degree/i, /\bsw\b/i],
  },
  {
    subFilterId: "lob",
    patterns: [/\blob\s*wedge/i, /\b58\s*degree/i, /\b60\s*degree/i, /\blw\b/i],
  },
  {
    subFilterId: "gap",
    patterns: [/\bgap\s*wedge/i, /\bapproach\s*wedge/i, /\b50\s*degree/i, /\b52\s*degree/i, /\bgw\b/i, /\baw\b/i],
  },
  {
    subFilterId: "pitching",
    patterns: [/\bpitching\s*wedge/i, /\b46\s*degree/i, /\b48\s*degree/i, /\bpw\b/i],
  },
];

const GOLF_PUTTER_RULES: SubFilterRule[] = [
  {
    subFilterId: "blade",
    patterns: [/\bblade\b/i, /\banser\b/i, /\bnewport\b/i],
    excludePatterns: [/\bmallet\b/i],
  },
  {
    subFilterId: "mallet",
    patterns: [/\bmallet\b/i, /\bspider\b/i, /\b2[\s-]?ball/i],
  },
];

const GOLF_BALL_RULES: SubFilterRule[] = [
  {
    subFilterId: "tour",
    patterns: [/\btour\b/i, /\bpro\s*v/i, /\btp5/i, /\bchrome\s*soft/i, /\bz[\s-]?star/i],
  },
  {
    subFilterId: "distance",
    patterns: [/\bdistance\b/i, /\bvelocity\b/i, /\bnoodle\b/i, /\bstraight\s*fl/i, /\bsuper\s*soft/i],
  },
  {
    subFilterId: "practice",
    patterns: [/\bpractice\b/i, /\brange\b/i, /\brecycled\b/i, /\brefurbished\b/i, /\blake\b/i, /\bused\b/i],
  },
];

const GOLF_BAG_RULES: SubFilterRule[] = [
  {
    subFilterId: "stand",
    patterns: [/\bstand\s*bag/i, /\bcarry\s*bag/i, /\bwalking\s*bag/i],
  },
  {
    subFilterId: "cart",
    patterns: [/\bcart\s*bag/i, /\briding\s*bag/i],
  },
  {
    subFilterId: "staff",
    patterns: [/\bstaff\s*bag/i, /\btour\s*bag/i],
  },
  {
    subFilterId: "travel",
    patterns: [/\btravel\b/i, /\bflight\b/i, /\bair\s*cover/i],
  },
];

const FOOTBALL_PROTECTIVE_RULES: SubFilterRule[] = [
  {
    subFilterId: "helmets",
    patterns: [/\bhelmet/i, /\bfacemask/i, /\bface[\s-]?mask/i, /\bchinstrap/i, /\bchin[\s-]?strap/i],
  },
  {
    subFilterId: "shoulder-pads",
    patterns: [/\bshoulder\s*pad/i, /\bback[\s-]?plate/i],
  },
  {
    subFilterId: "gloves",
    patterns: [/\bfootball\s*glove/i, /\breceiver\s*glove/i, /\blineman\s*glove/i, /\bwide\s*receiver/i, /\bskill\s*position\s*glove/i],
  },
  {
    subFilterId: "pads-guards",
    patterns: [/\bgirdle\b/i, /\brib\s*protect/i, /\btailbone/i, /\bknee\s*pad/i, /\bthigh\s*pad/i, /\bhip\s*pad/i, /\bpadded\s*(short|pant|girdle)/i, /\b(arm|elbow|forearm)\s*pad/i],
  },
  {
    subFilterId: "mouthguards",
    patterns: [/\bmouth\s*guard/i, /\bmouth\s*piece/i, /\bmouthguard/i, /\bmouthpiece/i],
  },
];

const FOOTBALL_BALL_RULES: SubFilterRule[] = [
  {
    subFilterId: "game",
    patterns: [/\bgame\b/i, /\bofficial\b/i, /\bnfhs\b/i, /\bncaa\b/i, /\bnfl\b/i, /\bcompetition\b/i],
  },
  {
    subFilterId: "practice",
    patterns: [/\bpractice\b/i, /\bcomposite\b/i, /\brubber\b/i, /\bjunior\b/i, /\byouth\b/i],
  },
];

const FOOTBALL_TRAINING_RULES: SubFilterRule[] = [
  {
    subFilterId: "agility",
    patterns: [/\bagility\b/i, /\btraining\s*cones?\b/i, /\bspeed\s*ladder/i, /\btraining\s*hurdle/i, /\bagility\s*ladder/i],
  },
  {
    subFilterId: "tackling",
    patterns: [/\btackling\b/i, /\btackle\s*dummy/i, /\bblocking\b/i, /\bsled\b/i],
  },
  {
    subFilterId: "passing",
    patterns: [/\bpassing\b/i, /\bthrow/i, /\btarget\b/i],
  },
];

const SOCCER_BALL_RULES: SubFilterRule[] = [
  {
    subFilterId: "match",
    patterns: [/\bmatch\b/i, /\bofficial\b/i, /\bgame\b/i, /\bfifa\b/i, /\bpro\b/i, /\belite\b/i],
  },
  {
    subFilterId: "training",
    patterns: [/\btraining\b/i, /\bpractice\b/i, /\breplica\b/i, /\bclub\b/i],
  },
  {
    subFilterId: "futsal",
    patterns: [/\bfutsal\b/i, /\bindoor\b/i],
  },
  {
    subFilterId: "mini",
    patterns: [/\bmini\b/i, /\bskills?\b/i, /\bsize\s*[12]\b/i],
  },
];

const SOCCER_SHOES_RULES: SubFilterRule[] = [
  {
    subFilterId: "firm-ground",
    patterns: [/\bfirm\s*ground/i, /\bfg\b/i],
  },
  {
    subFilterId: "soft-ground",
    patterns: [/\bsoft\s*ground/i, /\bsg\b/i],
  },
  {
    subFilterId: "turf",
    patterns: [/\bturf\b/i, /\btf\b/i, /\bastro\b/i],
  },
  {
    subFilterId: "indoor",
    patterns: [/\bindoor\b/i, /\bindoor\s*court/i, /\bfutsal\b/i, /\bhall\s*shoe/i],
  },
];

const SOCCER_PROTECTIVE_RULES: SubFilterRule[] = [
  {
    subFilterId: "shin-guards",
    patterns: [/\bshin\s*guard/i, /\bshin\s*pad/i, /\bshin\b/i],
  },
  {
    subFilterId: "goalkeeper-gloves",
    patterns: [/\bgoalkeeper\b/i, /\bgoalie\b/i, /\bgk\b/i, /\bkeeper\b/i],
  },
];

const SOCCER_TRAINING_RULES: SubFilterRule[] = [
  {
    subFilterId: "cones-markers",
    patterns: [/\bcones?\b/i, /\bmarkers?\s*(set|pack|disc)/i, /\bdisc\s*cone/i],
    excludePatterns: [/\bice\s*cream/i],
  },
  {
    subFilterId: "goals-nets",
    patterns: [/\bsoccer\s*goal/i, /\bsoccer\s*net/i, /\btraining\s*goal/i, /\bpopup\s*goal/i, /\bpop[\s-]?up\s*goal/i, /\brebounder\b/i],
  },
  {
    subFilterId: "agility",
    patterns: [/\bagility\b/i, /\bspeed\s*ladder/i, /\btraining\s*hurdle/i],
  },
];

const BASKETBALL_BALL_RULES: SubFilterRule[] = [
  {
    subFilterId: "indoor",
    patterns: [/\bindoor\b/i, /\bgame\b/i, /\bofficial\b/i, /\bleather\b/i],
    excludePatterns: [/\bindoor[\s/]*outdoor/i],
  },
  {
    subFilterId: "outdoor",
    patterns: [/\boutdoor\b/i, /\brubber\b/i, /\bstreet\b/i, /\bplayground\b/i],
    excludePatterns: [/\bindoor[\s/]*outdoor/i],
  },
  {
    subFilterId: "indoor-outdoor",
    patterns: [/\bindoor[\s/]*outdoor/i, /\ball[\s-]?surface/i, /\ball[\s-]?court/i, /\bcomposite\b/i],
  },
  {
    subFilterId: "mini",
    patterns: [/\bmini\b/i, /\byouth\b/i, /\bjunior\b/i, /\bsize\s*[345]\b/i],
  },
];

const BASKETBALL_SHOES_RULES: SubFilterRule[] = [
  {
    subFilterId: "performance",
    patterns: [/\bperformance\b/i, /\bgame\b/i, /\bcourt\b/i, /\bsignature\b/i],
    excludePatterns: [/\bretro\b/i, /\blifestyle\b/i],
  },
  {
    subFilterId: "lifestyle",
    patterns: [/\bretro\b/i, /\blifestyle\b/i, /\bcasual\b/i, /\bclassic\b/i, /\bheritage\b/i],
  },
];

const BASKETBALL_TRAINING_RULES: SubFilterRule[] = [
  {
    subFilterId: "hoops-systems",
    patterns: [/\bhoop\b/i, /\bbackboard\b/i, /\bgoal\b/i, /\bportable\b/i, /\bin[\s-]?ground\b/i],
  },
  {
    subFilterId: "dribbling",
    patterns: [/\bdribbl/i, /\bhandling\b/i, /\bdribble\s*goggle/i],
  },
  {
    subFilterId: "shooting",
    patterns: [/\bshooting\s*(machine|trainer|aid|sleeve)/i, /\bshot\s*trainer/i, /\bball\s*return/i, /\brebound\s*net/i],
  },
];

const HOCKEY_STICK_RULES: SubFilterRule[] = [
  {
    subFilterId: "senior",
    patterns: [/\bsenior\b/i, /\bsr\b/i],
    excludePatterns: [/\bjunior\b/i, /\bintermediate\b/i, /\byouth\b/i],
  },
  {
    subFilterId: "intermediate",
    patterns: [/\bintermediate\b/i, /\bint\b/i],
  },
  {
    subFilterId: "junior",
    patterns: [/\bjunior\b/i, /\bjr\b/i, /\byouth\b/i],
  },
];

const HOCKEY_SKATE_RULES: SubFilterRule[] = [
  {
    subFilterId: "player",
    patterns: [/\bplayer\b/i, /\bskate\b/i],
    excludePatterns: [/\bgoalie\b/i, /\bgoaltender\b/i],
  },
  {
    subFilterId: "goalie",
    patterns: [/\bgoalie\b/i, /\bgoaltender\b/i, /\bgoal\s*skate/i],
  },
];

const HOCKEY_PROTECTIVE_RULES: SubFilterRule[] = [
  {
    subFilterId: "goalie-equipment",
    patterns: [/\bgoalie\b/i, /\bgoaltender\b/i, /\bblocker\b/i, /\bgoal\s*pad/i],
  },
  {
    subFilterId: "helmets",
    patterns: [/\bhelmet/i, /\bface\s*cage/i, /\bvisor\b/i, /\bface\s*shield/i],
  },
  {
    subFilterId: "gloves",
    patterns: [/\bhockey\s*glove/i, /\bplayer\s*glove/i],
  },
  {
    subFilterId: "shin-guards",
    patterns: [/\bshin\s*guard/i, /\bshin\s*pad/i],
  },
  {
    subFilterId: "shoulder-pads",
    patterns: [/\bshoulder\s*pad/i, /\bupper[\s-]?body\s*protect/i],
  },
  {
    subFilterId: "pants",
    patterns: [/\bhockey\s*pant/i, /\bbreez/i, /\bice\s*pant/i],
  },
];

const LACROSSE_STICK_RULES: SubFilterRule[] = [
  {
    subFilterId: "attack",
    patterns: [/\battack\b/i, /\boffens/i, /\bshort\s*stick/i],
    excludePatterns: [/\bdefens/i, /\bgoalie\b/i],
  },
  {
    subFilterId: "defense",
    patterns: [/\bdefens/i, /\bd[\s-]?pole/i, /\blong\s*pole/i, /\blong\s*stick/i],
  },
  {
    subFilterId: "goalie",
    patterns: [/\bgoalie\b/i, /\bgoaltender\b/i],
  },
  {
    subFilterId: "complete",
    patterns: [/\bcomplete\b/i, /\bfull\s*stick/i],
  },
  {
    subFilterId: "heads",
    patterns: [/\blacrosse\s*head/i, /\blax\s*head/i, /\bunstrung\b/i, /\bhead\s*only\b/i, /\battack\s*head/i, /\bdefense\s*head/i],
    excludePatterns: [/\bhead\s*band/i, /\bcomplete\b/i, /\bhelmet/i],
  },
  {
    subFilterId: "shafts",
    patterns: [/\bshaft\b/i, /\bhandle\b/i],
  },
];

const LACROSSE_PROTECTIVE_RULES: SubFilterRule[] = [
  {
    subFilterId: "helmets",
    patterns: [/\bhelmet/i, /\bheadgear/i],
  },
  {
    subFilterId: "gloves",
    patterns: [/\blacrosse\s*glove/i, /\blax\s*glove/i],
  },
  {
    subFilterId: "pads",
    patterns: [/\barm\s*guard/i, /\barm\s*pad/i, /\bshoulder\s*pad/i, /\brib\s*pad/i, /\bchest\s*protect/i, /\belbow\s*pad/i],
  },
];

const FISHING_ROD_RULES: SubFilterRule[] = [
  {
    subFilterId: "spinning",
    patterns: [/\bspinning\b/i, /\bspin\s*rod/i],
  },
  {
    subFilterId: "casting",
    patterns: [/\bcasting\b/i, /\bbaitcast/i],
  },
  {
    subFilterId: "fly",
    patterns: [/\bfly\s*rod/i, /\bfly\s*fish/i],
  },
  {
    subFilterId: "trolling",
    patterns: [/\btrolling\b/i, /\bdownrigger\b/i],
  },
  {
    subFilterId: "ice",
    patterns: [/\bice\s*fish/i, /\bice\s*rod/i],
  },
];

const FISHING_REEL_RULES: SubFilterRule[] = [
  {
    subFilterId: "spinning",
    patterns: [/\bspinning\b/i, /\bspin\s*reel/i],
  },
  {
    subFilterId: "baitcasting",
    patterns: [/\bbaitcast/i, /\bround\s*reel/i, /\blow[\s-]?profile/i],
  },
  {
    subFilterId: "fly",
    patterns: [/\bfly\s*reel/i, /\bfly\s*fish/i],
  },
  {
    subFilterId: "conventional",
    patterns: [/\bconventional\b/i, /\btrolling\b/i, /\boffshore\b/i],
  },
];

const FISHING_LURE_RULES: SubFilterRule[] = [
  {
    subFilterId: "hard-baits",
    patterns: [/\bcrankbait/i, /\bjerkbait/i, /\btopwater\b/i, /\bswimbait/i, /\bplug\b/i, /\bpopper\b/i, /\bminnow\b/i, /\bspoon\b/i],
  },
  {
    subFilterId: "soft-baits",
    patterns: [/\bsoft\s*plastic/i, /\bworm\b/i, /\bcraw\b/i, /\bcreature\b/i, /\btube\b/i, /\bgrub\b/i, /\bswimbait/i, /\bsenko\b/i],
  },
  {
    subFilterId: "jigs",
    patterns: [/\bjig\b/i, /\bjigs\b/i, /\bjig\s*head/i],
  },
  {
    subFilterId: "spinners",
    patterns: [/\bspinner\b/i, /\bspinnerbait/i, /\bbuzzbait/i, /\bchatterbait/i, /\bblade\b/i],
  },
  {
    subFilterId: "line",
    patterns: [/\bline\b/i, /\bbraided\b/i, /\bfluorocarbon\b/i, /\bmono\b/i, /\bmonofilament\b/i, /\bleader\b/i],
  },
];

const CYCLING_BIKE_RULES: SubFilterRule[] = [
  {
    subFilterId: "road",
    patterns: [/\broad\s*bike/i, /\bendurance\b/i, /\baero\b/i, /\brace\s*bike/i],
    excludePatterns: [/\bmountain\b/i, /\bmtb\b/i, /\bgravel\b/i],
  },
  {
    subFilterId: "mountain",
    patterns: [/\bmountain\b/i, /\bmtb\b/i, /\btrail\b/i, /\benduro\b/i, /\bdownhill\b/i, /\bxc\b/i],
  },
  {
    subFilterId: "gravel",
    patterns: [/\bgravel\b/i, /\badventure\b/i, /\bcyclocross\b/i, /\bcx\b/i],
  },
  {
    subFilterId: "hybrid",
    patterns: [/\bhybrid\b/i, /\bcommut/i, /\bfitness\b/i, /\bcity\b/i, /\burban\b/i],
  },
  {
    subFilterId: "bmx",
    patterns: [/\bbmx\b/i, /\bfreestyle\b/i],
  },
];

const DISC_GOLF_DISTANCE_RULES: SubFilterRule[] = [
  {
    subFilterId: "overstable",
    patterns: [/\boverstable\b/i, /\bbeefy\b/i, /\bmeathook\b/i],
  },
  {
    subFilterId: "understable",
    patterns: [/\bunderstable\b/i, /\bflippy\b/i, /\bturnover\b/i],
  },
  {
    subFilterId: "stable",
    patterns: [/\bstable\b/i, /\bstraight\b/i, /\bneutral\b/i],
    excludePatterns: [/\boverstable\b/i, /\bunderstable\b/i],
  },
];

const SWIMMING_GOGGLES_RULES: SubFilterRule[] = [
  {
    subFilterId: "racing",
    patterns: [/\bracing\b/i, /\bcompetition\b/i, /\brace\b/i, /\belite\b/i, /\bswedish\b/i],
  },
  {
    subFilterId: "training",
    patterns: [/\btraining\b/i, /\bpractice\b/i, /\bfitness\b/i, /\brecreation/i],
  },
  {
    subFilterId: "open-water",
    patterns: [/\bopen[\s-]?water/i, /\btriathlon\b/i, /\btri\b/i, /\bpolarized\b/i, /\bmask\b/i],
  },
];

const SWIMMING_TRAINING_RULES: SubFilterRule[] = [
  {
    subFilterId: "paddles",
    patterns: [/\bpaddle/i, /\bhand\s*paddle/i],
  },
  {
    subFilterId: "fins",
    patterns: [/\bfin\b/i, /\bfins\b/i, /\bflipper/i],
  },
  {
    subFilterId: "kickboards",
    patterns: [/\bkickboard/i, /\bpull\s*buoy/i, /\bbuoy\b/i],
  },
  {
    subFilterId: "snorkels",
    patterns: [/\bsnorkel\b/i, /\bswim\s*snorkel/i],
  },
];

const VOLLEYBALL_BALL_RULES: SubFilterRule[] = [
  {
    subFilterId: "indoor",
    patterns: [/\bindoor\b/i, /\bgame\b/i, /\bofficial\b/i, /\bcompetition\b/i, /\bmatch\b/i],
    excludePatterns: [/\bbeach\b/i, /\boutdoor\b/i, /\bsand\b/i],
  },
  {
    subFilterId: "beach",
    patterns: [/\bbeach\b/i, /\boutdoor\b/i, /\bsand\b/i],
  },
  {
    subFilterId: "training",
    patterns: [/\btraining\b/i, /\bpractice\b/i, /\bheavy\b/i, /\bsetter\b/i],
  },
];

const ALL_CONFIGS: EquipmentSubFilterConfig[] = [
  { equipmentTypeIds: ["bb-gloves", "fp-gloves", "sp-gloves"], rules: GLOVE_RULES },
  { equipmentTypeIds: [...BASEBALL_BAT_GROUP_IDS], rules: BAT_RULES },
  { equipmentTypeIds: ["fp-bats", "sp-bats"], rules: BAT_RULES.filter(r => r.subFilterId !== "bbcor") },
  { equipmentTypeIds: ["bb-protective", "fp-protective", "sp-protective"], rules: PROTECTIVE_BASEBALL_RULES },
  { equipmentTypeIds: ["bb-training", "fp-training", "sp-training"], rules: TRAINING_BASEBALL_RULES },
  { equipmentTypeIds: ["bb-balls", "fp-balls", "sp-balls"], rules: BALL_BASEBALL_RULES },
  { equipmentTypeIds: ["bb-cleats", "fp-cleats", "sp-cleats"], rules: CLEAT_RULES },
  { equipmentTypeIds: ["golf-drivers"], rules: GOLF_DRIVER_RULES },
  { equipmentTypeIds: ["golf-irons", "golf-iron-sets"], rules: GOLF_IRON_RULES },
  { equipmentTypeIds: ["golf-wedges"], rules: GOLF_WEDGE_RULES },
  { equipmentTypeIds: ["golf-putters"], rules: GOLF_PUTTER_RULES },
  { equipmentTypeIds: ["golf-balls"], rules: GOLF_BALL_RULES },
  { equipmentTypeIds: ["golf-bags"], rules: GOLF_BAG_RULES },
  { equipmentTypeIds: ["fb-protective"], rules: FOOTBALL_PROTECTIVE_RULES },
  { equipmentTypeIds: ["fb-balls"], rules: FOOTBALL_BALL_RULES },
  { equipmentTypeIds: ["fb-training"], rules: FOOTBALL_TRAINING_RULES },
  { equipmentTypeIds: ["soc-balls"], rules: SOCCER_BALL_RULES },
  { equipmentTypeIds: ["soc-shoes-apparel"], rules: SOCCER_SHOES_RULES },
  { equipmentTypeIds: ["soc-protective"], rules: SOCCER_PROTECTIVE_RULES },
  { equipmentTypeIds: ["soc-training"], rules: SOCCER_TRAINING_RULES },
  { equipmentTypeIds: ["bk-balls"], rules: BASKETBALL_BALL_RULES },
  { equipmentTypeIds: ["bk-shoes-apparel"], rules: BASKETBALL_SHOES_RULES },
  { equipmentTypeIds: ["bk-training"], rules: BASKETBALL_TRAINING_RULES },
  { equipmentTypeIds: ["hk-sticks"], rules: HOCKEY_STICK_RULES },
  { equipmentTypeIds: ["hk-skates"], rules: HOCKEY_SKATE_RULES },
  { equipmentTypeIds: ["hk-protective"], rules: HOCKEY_PROTECTIVE_RULES },
  { equipmentTypeIds: ["lax-sticks"], rules: LACROSSE_STICK_RULES },
  { equipmentTypeIds: ["lax-protective"], rules: LACROSSE_PROTECTIVE_RULES },
  { equipmentTypeIds: ["fish-rods"], rules: FISHING_ROD_RULES },
  { equipmentTypeIds: ["fish-reels"], rules: FISHING_REEL_RULES },
  { equipmentTypeIds: ["fish-lures-line"], rules: FISHING_LURE_RULES },
  { equipmentTypeIds: ["cyc-bikes"], rules: CYCLING_BIKE_RULES },
  { equipmentTypeIds: ["dg-distance"], rules: DISC_GOLF_DISTANCE_RULES },
  { equipmentTypeIds: ["swim-goggles"], rules: SWIMMING_GOGGLES_RULES },
  { equipmentTypeIds: ["swim-training"], rules: SWIMMING_TRAINING_RULES },
  { equipmentTypeIds: ["vb-balls"], rules: VOLLEYBALL_BALL_RULES },
];

const configByEquipmentType = new Map<string, EquipmentSubFilterConfig>();
for (const cfg of ALL_CONFIGS) {
  for (const id of cfg.equipmentTypeIds) {
    configByEquipmentType.set(id, cfg);
  }
}

const BAT_EQUIPMENT_TYPE_IDS = new Set([...BASEBALL_BAT_GROUP_IDS, "fp-bats", "sp-bats"]);
const BALL_SIZE_EQUIPMENT_TYPE_IDS = new Set([
  "soc-balls",
  "bk-balls",
  "vb-balls",
  "fb-balls",
]);

/**
 * Parse drop weight from a bat title. Handles:
 *   - Explicit drop: "Drop 10", "Drop -10", "(-10)", " -10 "
 *   - Length/weight: "30/20", `30"/20oz`, "30 in / 20 oz", "30x20"
 *   - Length and weight separately: "30 inch ... 20 oz"
 * Returns the drop value as a positive integer (e.g. 10 for a -10 bat), or null.
 */
export function parseDropWeight(title: string): number | null {
  if (!title) return null;
  const t = title.toLowerCase();

  // Explicit drop notation: "drop 10", "drop -10", "drop10"
  const dropMatch = t.match(/\bdrop\s*-?\s*(\d{1,2})\b/);
  if (dropMatch) {
    const v = parseInt(dropMatch[1], 10);
    if (v >= 0 && v <= 20) return v;
  }

  // Parenthesized: "(-10)" or "(-13.5)"
  const parenMatch = t.match(/\(\s*-\s*(\d{1,2})\s*\)/);
  if (parenMatch) {
    const v = parseInt(parenMatch[1], 10);
    if (v >= 0 && v <= 20) return v;
  }

  // Bare negative drop: " -10 " (not part of length/weight notation), avoid years/dates
  const bareNeg = t.match(/(?:^|[\s,;:|])-(\d{1,2})(?=[\s,;:|"oz]|$)/);
  if (bareNeg) {
    const v = parseInt(bareNeg[1], 10);
    if (v >= 3 && v <= 14) return v;
  }

  // Length/weight pairs: "30/20", `30"/20oz`, "30in/20oz", "30 / 20", "30x20"
  // Length 24-36 in, weight 10-30 oz are realistic ranges for bats.
  const lwMatch = t.match(
    /(?<![\d.])(\d{2})\s*(?:in|inch|inches|"|'')?\s*[\/x×-]\s*(\d{2})\s*(?:oz|ounce|ounces|"|'')?(?![\d.])/,
  );
  if (lwMatch) {
    const length = parseInt(lwMatch[1], 10);
    const weight = parseInt(lwMatch[2], 10);
    if (length >= 24 && length <= 36 && weight >= 10 && weight <= 30) {
      const drop = length - weight;
      if (drop >= 3 && drop <= 14) return drop;
    }
  }

  // Separate "30 inch ... 20 oz" anywhere in the title
  const lenMatch = t.match(/\b(\d{2})\s*(?:in|inch|inches|"|'')\b/);
  const wtMatch = t.match(/\b(\d{2})\s*(?:oz|ounce|ounces)\b/);
  if (lenMatch && wtMatch) {
    const length = parseInt(lenMatch[1], 10);
    const weight = parseInt(wtMatch[1], 10);
    if (length >= 24 && length <= 36 && weight >= 10 && weight <= 30) {
      const drop = length - weight;
      if (drop >= 3 && drop <= 14) return drop;
    }
  }

  return null;
}

/**
 * Parse ball size for soccer/basketball/volleyball/football titles.
 * Soccer/basketball: size 3/4/5/6/7. Returns the size number or null.
 */
export function parseBallSize(title: string): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  // Bat / ball / glove sizes can be whole numbers (3, 4, 5) or decimals (11.5, 12.75).
  // Capture up to 5 digits + optional decimal, then clamp the stored string to 20 chars.
  const m = t.match(/\bsize\s*[#:]?\s*(\d{1,3}(?:\.\d{1,2})?)\b/);
  if (m) return m[1].slice(0, 20);
  // Glove sizing pattern: "11.5"" or "12.75 inch" or "11.5″" right after a glove-related word.
  const inchMatch = title.match(/(\d{1,2}(?:\.\d{1,2})?)\s*(?:"|″|inch|in\b)/i);
  if (inchMatch) return inchMatch[1].slice(0, 20);
  return null;
}

export function classifyDealSubFilter(title: string, equipmentTypeId: string | null): string | null {
  const all = classifyAllSubFilters(title, equipmentTypeId);
  return all.length > 0 ? all[0] : null;
}

/**
 * Collect EVERY sub-filter rule that matches a title for a given equipment type.
 * Used to tag a deal with multiple sub-filters at once (e.g. an Easton bat may
 * match both a position/style rule and a drop-weight rule). Order mirrors the
 * config rule order, so callers can treat the first element as "primary".
 */
export function classifyAllSubFilters(title: string, equipmentTypeId: string | null): string[] {
  if (!equipmentTypeId || !title) return [];

  const config = configByEquipmentType.get(equipmentTypeId);
  if (!config) return [];

  const matches: string[] = [];
  for (const rule of config.rules) {
    if (rule.excludePatterns?.some((p) => p.test(title))) continue;
    if (rule.patterns.some((p) => p.test(title))) {
      matches.push(`${equipmentTypeId}-${rule.subFilterId}`);
    }
  }
  return matches;
}

export interface DealAttributes {
  /** First (primary) match — kept for back-compat with code that wants a single tag. */
  subFilterId: string | null;
  /** Every sub-filter the title matched. May be empty. The primary tag is index 0. */
  subFilterIds: string[];
  dropWeight: number | null;
  sizeNumber: string | null;
}

/**
 * Smart classifier that returns multiple derived attributes from a deal title.
 * Used at sync time so deals get tagged consistently, and during reclassification.
 */
export function classifyDealAttributes(
  title: string,
  equipmentTypeId: string | null,
): DealAttributes {
  const subFilterIds = classifyAllSubFilters(title, equipmentTypeId);
  const subFilterId = subFilterIds[0] ?? null;
  const dropWeight =
    equipmentTypeId && BAT_EQUIPMENT_TYPE_IDS.has(equipmentTypeId)
      ? parseDropWeight(title)
      : null;
  const sizeNumber =
    equipmentTypeId && BALL_SIZE_EQUIPMENT_TYPE_IDS.has(equipmentTypeId)
      ? parseBallSize(title)
      : null;
  return { subFilterId, subFilterIds, dropWeight, sizeNumber };
}

export function classifyGloveSubFilter(title: string, equipmentTypeId: string): string | null {
  return classifyDealSubFilter(title, equipmentTypeId);
}

const ALL_CLASSIFIED_EQUIPMENT_TYPE_IDS = Array.from(configByEquipmentType.keys());

export interface BackfillOptions {
  /** When true, reclassifies every deal — not just those with NULL sub_filter_id. */
  reclassifyAll?: boolean;
}

export async function backfillSubFilters(
  options: BackfillOptions = {},
): Promise<{ updated: number; total: number; dropTagged: number; sizeTagged: number }> {
  const whereClause = options.reclassifyAll
    ? isNotNull(deals.equipmentTypeId)
    : and(isNull(deals.subFilterId), isNotNull(deals.equipmentTypeId));

  const candidates = await db
    .select({
      id: deals.id,
      title: deals.title,
      equipmentTypeId: deals.equipmentTypeId,
      currentSubFilterId: deals.subFilterId,
      currentDropWeight: deals.dropWeight,
      currentSizeNumber: deals.sizeNumber,
    })
    .from(deals)
    .where(whereClause);

  // In reclassify-all mode we also need to know each deal's current join-table
  // tags so we can detect changes in secondary tags (not just the legacy primary
  // column). Fetched in one query and indexed by deal id.
  const currentJoinTags = new Map<string, Set<string>>();
  if (options.reclassifyAll && candidates.length > 0) {
    const { dealSubFilters: dsfTable } = await import("@shared/schema");
    const ids = candidates.map((c) => c.id);
    const rows = await db
      .select({ dealId: dsfTable.dealId, subFilterId: dsfTable.subFilterId })
      .from(dsfTable)
      .where(inArray(dsfTable.dealId, ids));
    for (const r of rows) {
      let s = currentJoinTags.get(r.dealId);
      if (!s) {
        s = new Set();
        currentJoinTags.set(r.dealId, s);
      }
      s.add(r.subFilterId);
    }
  }

  const updates: {
    id: string;
    subFilterId: string | null;
    subFilterIds: string[];
    dropWeight: number | null;
    sizeNumber: string | null;
  }[] = [];

  for (const deal of candidates) {
    const attrs = classifyDealAttributes(deal.title, deal.equipmentTypeId);
    // Only queue an update if something actually changed. In reclassify-all
    // mode we also compare the full set of tags so a secondary-tag delta
    // (e.g. new rule now matches) still triggers a join-table refresh.
    let changed =
      attrs.subFilterId !== deal.currentSubFilterId ||
      attrs.dropWeight !== deal.currentDropWeight ||
      attrs.sizeNumber !== deal.currentSizeNumber;
    if (options.reclassifyAll && !changed) {
      const existing = currentJoinTags.get(deal.id) ?? new Set<string>();
      const next = new Set(attrs.subFilterIds);
      if (existing.size !== next.size) {
        changed = true;
      } else {
        for (const t of next) if (!existing.has(t)) { changed = true; break; }
      }
    }
    if (!changed) continue;
    // In partial mode we only fill in missing data — never overwrite an existing sub_filter.
    if (!options.reclassifyAll && deal.currentSubFilterId && !attrs.subFilterId) continue;
    const finalPrimary = options.reclassifyAll
      ? attrs.subFilterId
      : (deal.currentSubFilterId ?? attrs.subFilterId);
    // In partial mode, never delete existing join rows — only add newly-found
    // matches on top of whatever the deal already had. In full reclassify mode
    // the new classification is authoritative.
    const finalIds = options.reclassifyAll
      ? attrs.subFilterIds
      : Array.from(new Set([
          ...(deal.currentSubFilterId ? [deal.currentSubFilterId] : []),
          ...attrs.subFilterIds,
        ]));
    updates.push({
      id: deal.id,
      subFilterId: finalPrimary,
      subFilterIds: finalIds,
      dropWeight: attrs.dropWeight ?? deal.currentDropWeight ?? null,
      sizeNumber: attrs.sizeNumber ?? deal.currentSizeNumber ?? null,
    });
  }

  let updated = 0;
  let dropTagged = 0;
  let sizeTagged = 0;
  const batchSize = 500;
  const { dealSubFilters } = await import("@shared/schema");
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    for (const u of batch) {
      await db
        .update(deals)
        .set({
          subFilterId: u.subFilterId,
          dropWeight: u.dropWeight,
          sizeNumber: u.sizeNumber,
        })
        .where(eq(deals.id, u.id));
      // Sync join table to authoritative set for this deal.
      if (options.reclassifyAll) {
        await db.delete(dealSubFilters).where(eq(dealSubFilters.dealId, u.id));
      }
      if (u.subFilterIds.length > 0) {
        await db
          .insert(dealSubFilters)
          .values(u.subFilterIds.map((sfId) => ({ dealId: u.id, subFilterId: sfId })))
          .onConflictDoNothing();
      }
      if (u.dropWeight !== null) dropTagged++;
      if (u.sizeNumber !== null) sizeTagged++;
    }
    updated += batch.length;
  }

  return { updated, total: candidates.length, dropTagged, sizeTagged };
}

export function getAllSubFilterDefinitions(): { id: string; name: string; equipmentTypeId: string }[] {
  const defs: { id: string; name: string; equipmentTypeId: string }[] = [];

  for (const config of ALL_CONFIGS) {
    for (const eqTypeId of config.equipmentTypeIds) {
      for (const rule of config.rules) {
        const id = `${eqTypeId}-${rule.subFilterId}`;
        const name = rule.subFilterId
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        defs.push({ id, name, equipmentTypeId: eqTypeId });
      }
    }
  }

  return defs;
}
