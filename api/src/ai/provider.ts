/**
 * OpenAI-compatible chat + embeddings client with provider fallback.
 * Gemini (free tier) first; optional OmniRoute, Groq and OpenRouter add free fallbacks.
 * A provider is only used when its key is set.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface Provider {
  name: string;
  baseUrl: string;
  key: string;
  models: string[];
}

function providers(): Provider[] {
  const env = process.env;
  const list: Provider[] = [];
  if (env.GEMINI_API_KEY)
    list.push({
      name: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      key: env.GEMINI_API_KEY,
      models: (env.GEMINI_MODELS ?? "gemini-flash-lite-latest,gemini-flash-latest,gemini-2.5-flash").split(","),
    });
  // OmniRoute: self-hosted OpenAI-compatible router that fans out to other free providers.
  if (env.OMNIROUTE_URL)
    list.push({
      name: "omniroute",
      baseUrl: env.OMNIROUTE_URL.replace(/\/$/, ""),
      key: env.OMNIROUTE_API_KEY ?? "",
      models: (env.OMNIROUTE_MODELS ?? "auto").split(","),
    });
  if (env.GROQ_API_KEY)
    list.push({ name: "groq", baseUrl: "https://api.groq.com/openai/v1", key: env.GROQ_API_KEY, models: [env.GROQ_MODEL ?? "llama-3.1-8b-instant"] });
  if (env.OPENROUTER_API_KEY)
    list.push({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      key: env.OPENROUTER_API_KEY,
      models: [env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free"],
    });
  return list;
}

export const aiEnabled = () => providers().length > 0;

export class AiUnavailable extends Error {}

export interface ChatResult {
  message: ChatMessage;
  provider: string;
  model: string;
  tokens: number;
}

/** One chat completion, falling through models/providers on rate limits or errors. */
export async function chat(body: {
  messages: ChatMessage[];
  tools?: ToolDef[];
  responseSchema?: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatResult> {
  const errors: string[] = [];
  for (const p of providers()) {
    for (const model of p.models) {
      const r = await tryModel(p, model, body, errors);
      if (r === "skip_provider") break;
      if (r) return r;
    }
  }
  throw new AiUnavailable(errors.join("; ") || "No AI provider configured");
}

/** One model, with a single short retry when it is busy (429/503). */
async function tryModel(p: Provider, model: string, body: Parameters<typeof chat>[0], errors: string[]): Promise<ChatResult | null | "skip_provider"> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          model,
          messages: body.messages,
          tools: body.tools,
          temperature: body.temperature ?? 0.2,
          max_tokens: body.maxTokens ?? 700,
          ...(body.responseSchema && {
            response_format: { type: "json_schema", json_schema: { name: body.responseSchema.name, schema: body.responseSchema.schema } },
          }),
        }),
      });
      if (!res.ok) {
        errors.push(`${p.name}/${model}: HTTP ${res.status}`);
        if ((res.status === 429 || res.status === 503) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        return res.status === 401 || res.status === 403 ? "skip_provider" : null;
      }
      const data = (await res.json()) as { choices?: { message: ChatMessage }[]; usage?: { total_tokens?: number } };
      const message = data.choices?.[0]?.message;
      if (!message) {
        errors.push(`${p.name}/${model}: empty response`);
        return null;
      }
      return { message, provider: p.name, model, tokens: data.usage?.total_tokens ?? 0 };
    } catch (e) {
      errors.push(`${p.name}/${model}: ${(e as Error).name === "TimeoutError" ? "timeout" : (e as Error).message}`);
      return null;
    }
  }
  return null;
}

/** Embeddings (Gemini only). Returns null when unavailable so callers can skip semantic ranking. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || texts.length === 0) return null;
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ model: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001", input: texts, dimensions: 768 }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
