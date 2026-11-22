/**
 * The property assistant: understand → act → respond.
 *
 * 1. Rules parse the message (free, instant). Confident searches never call the LLM.
 * 2. Unclear searches use the LLM with a JSON schema (structured output).
 * 3. Open questions run a small tool-calling agent (max 4 steps) over our own data (RAG).
 * 4. Everything is shaped into one validated response the UI renders.
 * When AI is off or over its free limits, a rule-based fallback still answers.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSettings } from "../lib/settings.js";
import { AiCache, AiLog, AiUsage } from "../models/ai.js";
import { Listing } from "../models/listing.js";
import { toClient } from "../routes/listings.js";
import { findLocality, parseQuery, type SearchFilters, type Understanding } from "./parse.js";
import { aiEnabled, AiUnavailable, chat, type ChatMessage, type ToolDef } from "./provider.js";
import { compareLocalities, LOCALITIES, nextQuestions, searchListings, type ClientListing } from "./search.js";

/* ───────────── Contract with the UI ───────────── */

export const contextSchema = z
  .object({
    city: z.string().max(60).optional(),
    country: z.string().max(60).optional(),
    timeZone: z.string().max(60).optional(),
    device: z.enum(["mobile", "tablet", "desktop"]).optional(),
    currency: z.enum(["INR", "AED", "USD", "QAR"]).optional(),
  })
  .default({});
export type AssistantContext = z.infer<typeof contextSchema>;

export const chatInputSchema = z.object({
  message: z.string().trim().min(1).max(500),
  /** Filters from the previous turn, so "only near metro" refines the last search. */
  previous: z.record(z.unknown()).optional(),
  context: contextSchema,
});

const filtersSchema = z.object({
  purpose: z.enum(["buy", "rent"]).default("buy"),
  type: z.enum(["villa", "house", "apartment", "plot", "commercial"]).optional(),
  beds: z.number().int().min(1).max(10).optional(),
  budgetMax: z.number().positive().optional(),
  locality: z.string().optional(),
  city: z.string().optional(),
  near: z.string().optional(),
  maxMetroKm: z.number().optional(),
  maxItParkKm: z.number().optional(),
  maxHospitalKm: z.number().optional(),
  avoidFlood: z.boolean().optional(),
  minSchools2km: z.number().optional(),
});

export interface CardListing {
  id: string;
  title: string;
  price: number;
  purpose: string;
  type: string;
  beds?: number;
  locality: string;
  city: string;
  image?: string;
  highlight?: string;
  reasons: string[];
}

export interface AssistantResponse {
  reply: string;
  mode: "rule" | "llm" | "fallback" | "cache";
  intent: Understanding["intent"];
  filters?: SearchFilters;
  listings: CardListing[];
  total: number;
  /** Every matching listing id, so the page can show exactly the same set. */
  ids?: string[];
  chips: { label: string; prompt: string }[];
  compare?: ReturnType<typeof compareLocalities>;
  leadForm?: boolean;
  limited?: boolean;
}

/* ───────────── Limits ───────────── */

const today = () => new Date().toISOString().slice(0, 10);

async function takeAiQuota(visitorKey: string) {
  const { ai } = await getSettings();
  if (!ai.enabled) return false;
  const DAILY_PER_VISITOR = ai.dailyPerVisitor;
  const DAILY_GLOBAL = ai.globalDaily;
  const day = today();
  const [mine, global] = await Promise.all([
    AiUsage.findOne({ key: visitorKey, day }).lean(),
    AiUsage.aggregate([{ $match: { day } }, { $group: { _id: null, n: { $sum: "$count" } } }]),
  ]);
  if ((mine?.count ?? 0) >= DAILY_PER_VISITOR || (global[0]?.n ?? 0) >= DAILY_GLOBAL) return false;
  await AiUsage.updateOne({ key: visitorKey, day }, { $inc: { count: 1 } }, { upsert: true });
  return true;
}

/* ───────────── Main entry ───────────── */

export async function respond(input: z.infer<typeof chatInputSchema>, visitorKey: string): Promise<AssistantResponse> {
  const started = Date.now();
  const log: Record<string, unknown> = { toolCalls: [] as string[] };
  let res: AssistantResponse;
  try {
    res = await handle(input, visitorKey, log);
  } catch (e) {
    // Last-resort safety net: never surface a raw error to the visitor.
    log.error = (e as Error).message.slice(0, 300);
    res = await fallback(parseQuery(input.message), input, "I couldn't think that through just now, but here's what matches your search.");
  }
  await AiLog.create({ ...log, mode: res.mode, intent: res.intent, latencyMs: Date.now() - started, results: res.total, limited: res.limited }).catch(() => {});
  return res;
}

async function handle(input: z.infer<typeof chatInputSchema>, visitorKey: string, log: Record<string, unknown>): Promise<AssistantResponse> {
  const prev = filtersSchema.safeParse(input.previous ?? {}).success && input.previous ? (filtersSchema.parse(input.previous) as SearchFilters) : undefined;
  const u = parseQuery(input.message);

  if (u.intent === "greeting") return greeting(input.context);
  if (u.intent === "lead")
    return { reply: "Happy to help. Leave your name and number and an advisor will call you at a time that suits you.", mode: "rule", intent: "lead", listings: [], total: 0, chips: [], leadForm: true };
  if (u.intent === "compare" && u.compare) return compareReply(u.compare);

  // Refinement of the previous search ("only near metro", "avoid flood areas").
  const core = ["locality", "city", "type", "budget", "beds"];
  if (prev && u.intent === "search" && !u.matched.some((m) => core.includes(m)) && u.matched.length) {
    const refine: Partial<SearchFilters> = {};
    for (const k of ["near", "maxMetroKm", "maxItParkKm", "avoidFlood", "minSchools2km"] as const) if (u.filters[k] != null) Object.assign(refine, { [k]: u.filters[k] });
    if (u.matched.includes("purpose")) refine.purpose = u.filters.purpose;
    return searchReply({ ...prev, ...refine }, "search", input.message);
  }

  if (u.intent === "search" && u.confidence >= 0.45) return searchReply(u.filters, "search", input.message);

  // From here the LLM is needed. Check cache, then limits.
  const cacheKey = createHash("sha1").update(JSON.stringify([input.message.toLowerCase(), prev ?? null, input.context.city ?? null])).digest("hex");
  const hit = await AiCache.findOne({ key: cacheKey }).lean();
  if (hit) return { ...(hit.response as AssistantResponse), mode: "cache" };

  if (!aiEnabled()) return fallback(u, input);
  if (!(await takeAiQuota(visitorKey))) return { ...(await fallback(u, input)), limited: true };

  let out: AssistantResponse;
  try {
    out = u.intent === "question" ? await runAgent(input, prev, log) : await llmSearch(input, prev, log);
  } catch (e) {
    if (!(e instanceof AiUnavailable)) throw e;
    log.error = e.message.slice(0, 300);
    return fallback(u, input);
  }
  await AiCache.create({ key: cacheKey, response: out }).catch(() => {});
  return out;
}

/* ───────────── Responses ───────────── */

function money(inr: number) {
  if (inr >= 1e7) return `₹${+(inr / 1e7).toFixed(2)} Cr`;
  if (inr >= 1e5) return `₹${+(inr / 1e5).toFixed(1)} L`;
  return `₹${inr.toLocaleString("en-IN")}`;
}

function toCard(r: { listing: ClientListing; reasons: string[] }): CardListing {
  const l = r.listing;
  const h = l.highlights?.find((x) => x.category !== "school");
  return {
    id: l.id,
    title: l.title,
    price: l.price,
    purpose: l.purpose,
    type: l.type,
    beds: l.beds,
    locality: l.locality,
    city: l.city,
    image: (l as unknown as { images?: string[] }).images?.[0],
    highlight: h ? `${h.km} km · ${h.label}` : undefined,
    reasons: r.reasons.filter((x) => !h || !x.includes(h.label)),
  };
}

function describe(f: SearchFilters, count = 2) {
  const one = count === 1;
  const kind =
    f.type === "apartment" ? (one ? "flat" : "flats") : f.type === "villa" ? (one ? "villa or house" : "villas and houses") : f.type ? `${f.type}${one ? "" : "s"}` : one ? "home" : "homes";
  const parts = [`${f.beds ? `${f.beds}BHK+ ` : ""}${kind}${f.purpose === "rent" ? " for rent" : ""}`];
  if (f.locality) parts.push(`in and around ${f.locality}`);
  else if (f.city) parts.push(`in ${f.city === "Thiruvananthapuram" ? "Trivandrum" : f.city}`);
  if (f.budgetMax) parts.push(`up to ${money(f.budgetMax)}${f.purpose === "rent" ? "/month" : ""}`);
  return parts.join(" ");
}

async function searchReply(f: SearchFilters, intent: Understanding["intent"], text: string, mode: AssistantResponse["mode"] = "rule", lead?: string): Promise<AssistantResponse> {
  const semantic = /\b(pool|view|garden|gated|furnished|lake|backwater|quiet|peaceful|parking|lift|solar|modern|traditional|heritage|sea|river|balcony)\b/i.test(text) ? text : undefined;
  const { total, results } = await searchListings(f, { semanticQuery: semantic, limit: 500 });
  const all = results.map((r) => r.listing);
  const chips = nextQuestions(f, all);
  if (total === 0) {
    return {
      reply: `${lead ? `${lead} ` : ""}I couldn't find verified ${describe(f)} yet. Try a slightly higher budget or a nearby area, or leave your number and we'll call when one is listed.`,
      mode,
      intent,
      filters: f,
      listings: [],
      total: 0,
      chips: [{ label: "Widen the budget by 20%", prompt: f.budgetMax ? `${describe({ ...f, budgetMax: Math.round(f.budgetMax * 1.2) })}` : "show all homes" }, { label: "Call me when one is listed", prompt: "call me back" }],
    };
  }
  const top = results[0];
  const why = top.reasons.length ? ` (${top.reasons.join(", ")})` : "";
  const reply = `${lead ? `${lead} ` : ""}I found ${total} verified ${describe(f, total)}. My top pick is ${top.listing.title} at ${money(top.listing.price)}${why}.`;
  return { reply, mode, intent, filters: f, listings: results.slice(0, 3).map(toCard), total, ids: all.slice(0, 200).map((l) => l.id), chips };
}

function compareReply([a, b]: [string, string]): AssistantResponse {
  const rows = compareLocalities(a, b);
  const [x, y] = rows;
  const cheaper = x.psf <= y.psf ? x : y;
  const faster = x.yoy >= y.yoy ? x : y;
  const metro = (r: (typeof rows)[number]) => r.metro?.km ?? 99;
  const better = metro(x) <= metro(y) ? x : y;
  const first = cheaper === faster ? `${cheaper.name} is cheaper per sq.ft and has grown faster this year.` : `${cheaper.name} is cheaper per sq.ft; ${faster.name} has grown faster this year.`;
  return {
    reply: `${first} ${better.name} has better metro access (${better.metro?.name}, ${better.metro?.km} km). Figures are indicative.`,
    mode: "rule",
    intent: "compare",
    listings: [],
    total: 0,
    compare: rows,
    chips: rows.map((r) => ({ label: `Show homes in ${r.name}`, prompt: `homes in ${r.name}` })),
  };
}

function greeting(ctx: AssistantContext): AssistantResponse {
  const s = starterSuggestions(ctx);
  return { reply: s.greeting, mode: "rule", intent: "greeting", listings: [], total: 0, chips: s.prompts };
}

async function fallback(u: Understanding, input: z.infer<typeof chatInputSchema>, note?: string): Promise<AssistantResponse> {
  const hasAny = u.matched.length > 0;
  if (hasAny && u.intent !== "question") return searchReply(u.filters, "search", input.message, "fallback", note);
  const s = starterSuggestions(input.context);
  return {
    reply:
      note ??
      "I can search by place, budget and type, for example “2BHK flat in Kakkanad under 50 lakh” or “villa near Technopark”. Try one of these:",
    mode: "fallback",
    intent: u.intent,
    listings: [],
    total: 0,
    chips: s.prompts,
  };
}

/* ───────────── Personalised starters (no LLM) ───────────── */

const GULF = ["Asia/Dubai", "Asia/Muscat", "Asia/Qatar", "Asia/Bahrain", "Asia/Riyadh", "Asia/Kuwait"];
const CITY_FROM_GEO: Record<string, string> = {
  kochi: "Kochi",
  cochin: "Kochi",
  ernakulam: "Kochi",
  "kochi (cochin)": "Kochi",
  thiruvananthapuram: "Thiruvananthapuram",
  trivandrum: "Thiruvananthapuram",
  kozhikode: "Kozhikode",
  calicut: "Kozhikode",
};

let medianCache: Map<string, number> | null = null;
export async function warmStarters() {
  const rows = await Listing.find({ status: "published", purpose: "buy", type: "apartment" }, { city: 1, price: 1 }).lean();
  medianCache = new Map();
  for (const city of new Set(rows.map((r) => r.city as string))) {
    const prices = rows.filter((r) => r.city === city).map((r) => r.price).sort((a, b) => a - b);
    medianCache.set(city, prices[Math.floor(prices.length / 2)]);
  }
}

export function starterSuggestions(ctx: AssistantContext) {
  const geoCity = ctx.city ? CITY_FROM_GEO[ctx.city.toLowerCase()] : undefined;
  const city = geoCity ?? "Kochi";
  const hub = LOCALITIES.filter((l) => l.city === city).sort((a, b) => b.listingCount - a.listingCount)[0]?.name ?? "Kakkanad";
  const median = medianCache?.get(city) ?? 5_000_000;
  const budget = Math.max(3_000_000, Math.round(median / 1_000_000) * 1_000_000); // round to ₹10 L
  const budgetLabel = budget >= 1e7 ? `${+(budget / 1e7).toFixed(1)} Cr` : `${budget / 1e5} lakh`;
  const nri = ctx.timeZone ? GULF.includes(ctx.timeZone) || /^(America|Europe|Australia)\//.test(ctx.timeZone) : false;
  const cityName = city === "Thiruvananthapuram" ? "Trivandrum" : city;

  const headline = `Looking for a ₹${budgetLabel} flat in ${hub}?`;
  const prompts = nri
    ? [
        { label: `Video tour of villas in ${cityName}`, prompt: `villas in ${cityName}` },
        { label: headline.replace("Looking for a ", "").replace("?", ""), prompt: `flat in ${hub} under ${budgetLabel}` },
        { label: "Homes near an IT park", prompt: city === "Thiruvananthapuram" ? "flats near technopark" : "flats near infopark" },
        { label: "Talk to an NRI advisor", prompt: "call me back" },
      ]
    : [
        { label: `₹${budgetLabel} flat in ${hub}`, prompt: `flat in ${hub} under ${budgetLabel}` },
        { label: `Villas in ${cityName}`, prompt: `villas in ${cityName}` },
        { label: `Rent near ${hub}`, prompt: `flat for rent in ${hub}` },
        { label: `Plots in ${cityName}`, prompt: `plots in ${cityName}` },
      ];
  const where = geoCity ? `in ${cityName}` : nri ? "abroad" : "";
  const greeting = nri
    ? `Hi! Buying in Kerala from ${where}? I can shortlist verified homes, show prices in your currency and set up a live video tour.`
    : `Hi! I'm your property assistant${geoCity ? ` for ${cityName}` : ""}. Tell me a place, budget and type, or pick one below.`;
  return { greeting, headline, prompts, city, hub };
}

/* ───────────── LLM: structured extraction ───────────── */

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["search", "compare", "lead", "greeting", "question"] },
    purpose: { type: "string", enum: ["buy", "rent"] },
    type: { type: "string", enum: ["villa", "apartment", "plot", "commercial"], description: "Houses count as villa" },
    beds: { type: "integer" },
    budgetMaxInr: { type: "number", description: "Upper budget in rupees. 1 lakh = 100000, 1 crore = 10000000." },
    locality: { type: "string", description: "Locality named by the user, as written" },
    city: { type: "string", enum: ["Kochi", "Thiruvananthapuram", "Kozhikode"] },
    near: { type: "string", enum: ["infopark", "technopark", "smartcity", "cyberpark", "lulu", "airport"] },
    nearMetro: { type: "boolean" },
    avoidFlood: { type: "boolean" },
    familyWithKids: { type: "boolean", description: "Wants schools nearby" },
    nearHospital: { type: "boolean", description: "Wants a hospital close by (e.g. elderly parents)" },
    compareA: { type: "string", description: "First locality when comparing two" },
    compareB: { type: "string", description: "Second locality when comparing two" },
  },
  required: ["intent", "purpose"],
};

/** LLM structured output → validated filters. Shared by the assistant and the evals. */
export async function llmExtract(message: string, prev?: SearchFilters) {
  const known = LOCALITIES.map((l) => l.name).join(", ");
  const r = await chat({
    responseSchema: { name: "property_query", schema: EXTRACT_SCHEMA },
    messages: [
      {
        role: "system",
        content: `Extract a Kerala property query from the user's message. Users may write English, Malayalam or Manglish (e.g. "veedu" = house, "vaadaka" = rent, "sthalam" = land). Known localities: ${known}. Previous search: ${JSON.stringify(prev ?? {})}. Keep previous values unless the user changes them. Only fill fields the user implies. Greetings like "hi" are intent greeting; open questions are intent question.`,
      },
      { role: "user", content: message },
    ],
  });
  const raw = JSON.parse(r.message.content ?? "{}");
  const loc = raw.locality ? findLocality(String(raw.locality)) : null;
  const f: SearchFilters = {
    ...(prev ?? {}),
    purpose: raw.purpose === "rent" ? "rent" : "buy",
    ...(raw.type && { type: raw.type }),
    ...(raw.beds && { beds: raw.beds }),
    ...(raw.budgetMaxInr > 5000 && { budgetMax: Math.round(raw.budgetMaxInr) }),
    ...(raw.city && { city: raw.city }),
    ...(loc && { locality: loc.name, city: loc.city }),
    ...(raw.near && { near: raw.near }),
    ...(raw.nearMetro && { maxMetroKm: 1 }),
    ...(raw.avoidFlood && { avoidFlood: true }),
    ...(raw.familyWithKids && { minSchools2km: 10 }),
    ...(raw.nearHospital && { maxHospitalKm: 2 }),
  };
  const a = raw.compareA && findLocality(String(raw.compareA));
  const b = raw.compareB && findLocality(String(raw.compareB));
  return {
    intent: (["search", "compare", "lead", "greeting", "question"].includes(raw.intent) ? raw.intent : "search") as Understanding["intent"],
    filters: filtersSchema.parse(f) as SearchFilters, // structured output is validated, never trusted blindly
    compare: a && b ? ([a.name, b.name] as [string, string]) : undefined,
    usage: { provider: r.provider, model: r.model, tokens: r.tokens },
  };
}

async function llmSearch(input: z.infer<typeof chatInputSchema>, prev: SearchFilters | undefined, log: Record<string, unknown>) {
  const x = await llmExtract(input.message, prev);
  Object.assign(log, x.usage);
  if (x.intent === "lead") return { reply: "Sure. Leave your name and number and an advisor will call you.", mode: "llm" as const, intent: "lead" as const, listings: [], total: 0, chips: [], leadForm: true };
  if (x.intent === "compare" && x.compare) return { ...compareReply(x.compare), mode: "llm" as const };
  if (x.intent === "greeting") return { ...greeting(input.context), mode: "llm" as const };
  return searchReply(x.filters, "search", input.message, "llm");
}

/* ───────────── LLM: tool-calling agent for open questions ───────────── */

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_listings",
      description: "Search verified listings. Returns the top matches with facts.",
      parameters: {
        type: "object",
        properties: {
          purpose: { type: "string", enum: ["buy", "rent"] },
          type: { type: "string", enum: ["villa", "apartment", "plot", "commercial"] },
          beds: { type: "integer" },
          budgetMax: { type: "number", description: "Rupees" },
          locality: { type: "string" },
          city: { type: "string", enum: ["Kochi", "Thiruvananthapuram", "Kozhikode"] },
          maxMetroKm: { type: "number" },
          maxHospitalKm: { type: "number" },
          avoidFlood: { type: "boolean" },
          minSchools2km: { type: "number" },
        },
        required: ["purpose"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_localities",
      description: "Compare two localities: price per sq.ft, yearly change, metro, IT park, schools, listing count.",
      parameters: { type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a", "b"] },
    },
  },
  {
    type: "function",
    function: {
      name: "find_listing",
      description: "Find listings by (part of) their name, across all areas. Use this when the visitor names a specific property.",
      parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  },
  {
    type: "function",
    function: {
      name: "listing_details",
      description: "All known facts about one listing by id (e.g. L002), including nearby places and a price check against the area average.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "offer_callback",
      description: "Show a form so the visitor can leave their number for an advisor to call.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function runAgent(input: z.infer<typeof chatInputSchema>, prev: SearchFilters | undefined, log: Record<string, unknown>): Promise<AssistantResponse> {
  const ctx = input.context;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You are the property assistant for a Kerala real estate site. Be warm, brief and practical.",
        "Rules: use the tools for any fact about listings, places, distances or prices. Never invent listings, prices or distances.",
        "If tools return nothing, say so and suggest a wider search. Prices are indicative demo data; say so when giving price opinions.",
        "Reply in English (users may write Manglish), at most 80 words, plain text with no markdown. Mention listing titles, not ids.",
        "When the visitor names a specific property, call find_listing (it searches all areas, ignoring the previous search), then listing_details.",
        `Known localities: ${LOCALITIES.map((l) => l.name).join(", ")}.`,
        `Visitor: ${ctx.city ? `in ${ctx.city}` : "location unknown"}, ${ctx.device ?? "unknown device"}, currency ${ctx.currency ?? "INR"}${ctx.timeZone ? `, time zone ${ctx.timeZone}` : ""}.`,
        `Previous search: ${JSON.stringify(prev ?? {})}.`,
      ].join("\n"),
    },
    { role: "user", content: input.message },
  ];

  let lastSearch: { f: SearchFilters; total: number; results: Awaited<ReturnType<typeof searchListings>>["results"] } | null = null;
  let compare: AssistantResponse["compare"];
  let leadForm = false;
  let tokens = 0;
  const focused: string[] = []; // listings the agent looked at in detail are shown first

  for (let step = 0; step < 4; step++) {
    const r = await chat({ messages, tools: TOOLS, maxTokens: 400 });
    tokens += r.tokens;
    Object.assign(log, { provider: r.provider, model: r.model, tokens });
    messages.push(r.message);
    const calls = r.message.tool_calls ?? [];
    if (!calls.length) {
      const reply = plain(r.message.content) || "Here's what I found.";
      const all = lastSearch ? (await searchListings(lastSearch.f, { limit: 200 })).results.map((x) => x.listing) : [];
      return {
        reply,
        mode: "llm",
        intent: "question",
        filters: lastSearch?.f,
        listings: await cardsFor(focused, lastSearch?.results ?? []),
        total: focused.length || lastSearch?.total || 0,
        chips: lastSearch ? nextQuestions(lastSearch.f, all) : [],
        compare,
        leadForm,
      };
    }
    for (const call of calls) {
      (log.toolCalls as string[]).push(call.function.name);
      let result: unknown;
      try {
        const args = JSON.parse(call.function.arguments || "{}");
        if (call.function.name === "search_listings") {
          const f = filtersSchema.parse({ ...args, locality: LOCALITIES.find((l) => l.name.toLowerCase() === String(args.locality ?? "").toLowerCase())?.name }) as SearchFilters;
          const s = await searchListings(f, { semanticQuery: input.message, limit: 5 });
          lastSearch = { f, ...s };
          result = { total: s.total, top: s.results.map((x) => facts(x.listing)) };
        } else if (call.function.name === "find_listing") {
          const words = String(args.name ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
          const rows = words.length ? await Listing.find({ status: "published", $and: words.map((w) => ({ title: new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, ""), "i") })) }).limit(5).lean() : [];
          result = rows.length ? rows.map((l) => ({ id: l._id, title: l.title, locality: l.locality, price: money(l.price) })) : { error: "No listing with that name" };
        } else if (call.function.name === "compare_localities") {
          compare = compareLocalities(match(args.a), match(args.b));
          result = compare.length === 2 ? compare : { error: "Unknown locality" };
        } else if (call.function.name === "listing_details") {
          result = await details(String(args.id));
          if (!("error" in (result as object))) focused.push(String(args.id));
        } else if (call.function.name === "offer_callback") {
          leadForm = true;
          result = { ok: true, note: "A callback form is shown to the visitor." };
        } else result = { error: "Unknown tool" };
      } catch (e) {
        result = { error: (e as Error).message.slice(0, 120) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) });
    }
  }
  // Ran out of steps: answer from whatever was retrieved.
  if (lastSearch) return searchReply(lastSearch.f, "question", input.message, "llm");
  return { reply: "Let me connect you with an advisor for that one.", mode: "llm", intent: "question", listings: [], total: 0, chips: [], leadForm: true };
}

/** Strip markdown the model sometimes adds; the chat shows plain text. */
function plain(s: string | null | undefined) {
  return (s ?? "").replace(/\*\*?([^*]+)\*\*?/g, "$1").replace(/(^|\s)_([^_]+)_/g, "$1$2").replace(/^#+\s*/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

async function cardsFor(ids: string[], searched: Awaited<ReturnType<typeof searchListings>>["results"]) {
  if (ids.length) {
    const rows = await Listing.find({ _id: { $in: ids }, status: "published" }).lean();
    return rows.map((l) => toCard({ listing: toClient(l) as ClientListing, reasons: [] }));
  }
  return searched.slice(0, 3).map(toCard);
}

const match = (name: string) => LOCALITIES.find((l) => l.name.toLowerCase() === String(name).toLowerCase())?.name ?? String(name);

function facts(l: ClientListing) {
  return {
    id: l.id,
    title: l.title,
    price: money(l.price),
    purpose: l.purpose,
    type: l.type,
    beds: l.beds,
    locality: l.locality,
    rera: l.rera?.status,
    flood: l.flood?.level,
    nearby: l.highlights?.map((h) => `${h.label} ${h.km} km`),
    schools2km: l.counts?.schools2km,
  };
}

async function details(id: string) {
  const l = await Listing.findOne({ _id: id, status: "published" }).lean();
  if (!l) return { error: "Listing not found" };
  const c = toClient(l) as ClientListing & { builtUpSqft?: number; amenities?: string[] };
  const area = LOCALITIES.find((x) => x.name === c.locality);
  const psf = c.builtUpSqft && c.purpose === "buy" ? Math.round(c.price / c.builtUpSqft) : null;
  return {
    ...facts(c),
    builtUpSqft: c.builtUpSqft,
    amenities: c.amenities,
    nearbyAll: Object.entries(c.nearby ?? {}).map(([k, v]) => `${k}: ${v.name} ${v.km} km`),
    priceCheck:
      psf && area
        ? { listingPerSqft: psf, areaAvgPerSqft: area.psf, verdict: psf > area.psf * 1.15 ? "above area average" : psf < area.psf * 0.85 ? "below area average" : "close to area average" }
        : null,
  };
}
