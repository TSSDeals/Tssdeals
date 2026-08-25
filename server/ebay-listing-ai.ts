import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ListingGenerationInput {
  description: string;
  imageUrls: string[];
  sport?: string;
  condition?: string;
}

export interface GeneratedListing {
  title: string;
  description: string;
  suggestedPrice: null;
  category: string;
  conditionId: string;
  conditionLabel: string;
  itemSpecifics: Record<string, string>;
  missingFacts: string[];
}

export async function generateEbayListing(input: ListingGenerationInput): Promise<GeneratedListing> {
  const imageContext = input.imageUrls.length > 0
    ? `I'm providing ${input.imageUrls.length} photo(s) of the item.`
    : "No photos provided.";

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are an expert eBay seller specializing in sporting goods. 
You create accurate eBay listing drafts without inventing facts.

Your task is to generate an eBay listing based on the seller's description and photos.

Return a JSON object with these fields:
- "title": An optimized eBay listing title (max 80 characters). Include brand, model, size, color, and key features. Use keywords buyers search for.
- "description": Clean, simple HTML containing only facts explicitly supplied by the seller or unambiguously visible in the photos. Never add shipping, packaging, handling-time, warranty, authenticity, odor, accessory, measurement, or condition-grade claims unless the seller explicitly supplied them.
- "suggestedPrice": Always null. No market evidence is supplied, so the seller must confirm the price.
- "category": The most appropriate eBay category name (e.g., "Baseball & Softball Gloves & Mitts", "Running Shoes", etc.)
- "conditionId": eBay condition ID as a string. Use "1000" for New, "1500" for New Other, "2500" for Refurbished, "3000" for Used, "7000" for For Parts.
- "conditionLabel": Human-readable condition (e.g., "New", "New Other", "Used", "For Parts")
- "itemSpecifics": An object containing only specifics explicitly supplied or unambiguously visible. Omit uncertain values.
- "missingFacts": An array of important facts the seller should confirm. Include price and any uncertain condition, size, handedness, model, included accessories, or defects.

Accuracy rules:
- Do not infer a condition grade. If the seller did not select a condition, return empty conditionId and conditionLabel and add condition to missingFacts.
- Do not claim knowledge of typical prices or suggest a price.
- Do not turn absence of a disclosed defect into a positive claim.
- Preserve the seller's wording for condition and defects; do not upgrade it with words such as excellent, pristine, mint, or like new.

Return ONLY valid JSON, no markdown code blocks or extra text.`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `${imageContext}\n\nSeller's description: ${input.description}${input.sport ? `\nSport category: ${input.sport}` : ""}${input.condition ? `\nCondition: ${input.condition}` : ""}`,
        },
        ...input.imageUrls.map((url) => ({
          type: "image_url" as const,
          image_url: { url, detail: "high" as const },
        })),
      ],
    },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    max_tokens: 2000,
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as GeneratedListing;

    if (!parsed.title || !parsed.description || parsed.suggestedPrice !== null) {
      throw new Error("Missing required fields in AI response");
    }

    if (parsed.title.length > 80) throw new Error("AI title exceeds 80 characters");
    if (!parsed.itemSpecifics || typeof parsed.itemSpecifics !== "object" || Array.isArray(parsed.itemSpecifics)) {
      throw new Error("Invalid item specifics in AI response");
    }
    if (!Array.isArray(parsed.missingFacts)) throw new Error("Invalid missing facts in AI response");

    return parsed;
  } catch (err: any) {
    throw new Error(`Failed to parse AI listing response: ${err.message}`);
  }
}
