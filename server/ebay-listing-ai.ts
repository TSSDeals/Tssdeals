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
  suggestedPrice: number;
  category: string;
  conditionId: string;
  conditionLabel: string;
  itemSpecifics: Record<string, string>;
}

export async function generateEbayListing(input: ListingGenerationInput): Promise<GeneratedListing> {
  const imageContext = input.imageUrls.length > 0
    ? `I'm providing ${input.imageUrls.length} photo(s) of the item.`
    : "No photos provided.";

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are an expert eBay seller specializing in sporting goods. 
You create optimized eBay listings that maximize visibility and sales.

Your task is to generate an eBay listing based on the seller's description and photos.

Return a JSON object with these fields:
- "title": An optimized eBay listing title (max 80 characters). Include brand, model, size, color, and key features. Use keywords buyers search for.
- "description": A detailed HTML description for the eBay listing. Include item details, condition notes, measurements if relevant, and shipping info placeholder. Use clean HTML with headers, bullet points, and formatting. Keep it professional.
- "suggestedPrice": A suggested Buy It Now price in USD (number, no dollar sign). Base this on typical eBay market prices for similar items.
- "category": The most appropriate eBay category name (e.g., "Baseball & Softball Gloves & Mitts", "Running Shoes", etc.)
- "conditionId": eBay condition ID as a string. Use "1000" for New, "1500" for New Other, "2500" for Refurbished, "3000" for Used, "7000" for For Parts.
- "conditionLabel": Human-readable condition (e.g., "New", "New Other", "Used", "For Parts")
- "itemSpecifics": An object of key-value pairs for eBay item specifics like Brand, Model, Size, Color, Sport, Material, etc. Include as many relevant specifics as you can determine.

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
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as GeneratedListing;

    if (!parsed.title || !parsed.description || !parsed.suggestedPrice) {
      throw new Error("Missing required fields in AI response");
    }

    return parsed;
  } catch (err: any) {
    throw new Error(`Failed to parse AI listing response: ${err.message}`);
  }
}
