/**
 * Hydra API Strategy: Manages multiple API providers and keys with automatic failover.
 * Supports: Gemini, Groq, OpenCode, OpenRouter, TokenRouter.
 */

export interface ApiProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
}

// User-provided API keys and providers
export const API_PROVIDERS: ApiProvider[] = [
  {
    name: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: process.env["GEMINI_API_KEY"] || "",
    model: "gemini-2.0-flash",
    headers: {
      "x-goog-api-key": process.env["GEMINI_API_KEY"] || "",
    },
  },
  {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: process.env["GROQ_API_KEY"] || "",
    model: "llama3-70b-8192",
  },
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: process.env["OPENROUTER_API_KEY"] || "",
    model: "qwen/qwen3-235b-a22b:free",
  },
  {
    name: "TokenRouter",
    baseUrl: "https://api.tokenrouter.ai/v1",
    apiKey: process.env["TOKENROUTER_API_KEY"] || "",
    model: "qwen/qwen3.8-max-free",
  },
  {
    name: "OpenCode",
    baseUrl: "https://api.opencode.ai/v1",
    apiKey: process.env["OPENCODE_API_KEY"] || "",
    model: "deepseek-v3",
  },
];

// Rate limit tracking
const rateLimitMap = new Map<string, number>();

/**
 * Call an AI provider with automatic failover.
 * If one provider fails (rate limit, error), it tries the next one.
 */
export async function callHydraGateway(
  body: unknown,
  attempt = 0
): Promise<string> {
  const now = Date.now();
  
  // Try each provider in order, skipping those on cooldown
  for (const provider of API_PROVIDERS) {
    const cooldownUntil = rateLimitMap.get(provider.name) || 0;
    if (now < cooldownUntil) continue;
    
    if (!provider.apiKey) continue;
    
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...provider.headers,
      };
      
      // Add Authorization header if no custom headers handling
      if (!provider.headers?.["x-goog-api-key"]) {
        headers["Authorization"] = `Bearer ${provider.apiKey}`;
      }
      
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...body,
          model: provider.model,
        }),
      });
      
      if (response.ok) {
        const json = await response.json() as {
          choices?: { message?: { content?: string } }[];
        };
        const content = json.choices?.[0]?.message?.content ?? "";
        if (content.trim()) {
          console.log(`[Hydra] Success with ${provider.name}`);
          return content;
        }
      }
      
      // Handle rate limits (429) - put provider on cooldown
      if (response.status === 429) {
        console.log(`[Hydra] Rate limited by ${provider.name}, cooling down...`);
        rateLimitMap.set(provider.name, now + 60000); // 1 minute cooldown
        continue;
      }
      
      // Handle other errors
      if (response.status >= 400) {
        console.warn(`[Hydra] Error from ${provider.name}: ${response.status}`);
        continue;
      }
      
    } catch (error) {
      console.warn(`[Hydra] Network error with ${provider.name}:`, error);
      continue;
    }
  }
  
  // If all providers failed and we haven't exhausted retries
  if (attempt < 3) {
    console.log(`[Hydra] All providers failed, retrying in 2s...`);
    await new Promise(r => setTimeout(r, 2000));
    return callHydraGateway(body, attempt + 1);
  }
  
  throw new Error("Hydra API: Semua provider gagal. Silakan coba lagi nanti.");
}

/**
 * Parse JSON block from AI response (handles markdown code blocks)
 */
export function parseJsonBlock<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  if (start === -1 || end === -1) throw new Error("AI tidak mengembalikan JSON yang valid.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
