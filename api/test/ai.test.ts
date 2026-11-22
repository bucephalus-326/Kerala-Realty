import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { DEMO_PASSWORD, seedIfEmpty } from "../src/scripts/seed-data.js";
import { warmStarters } from "../src/ai/assistant.js";
import { parseQuery } from "../src/ai/parse.js";

const app = createApp();
const realFetch = globalThis.fetch;

beforeAll(async () => {
  await connectDb();
  await seedIfEmpty();
  await warmStarters();
});
afterAll(disconnectDb);
afterEach(() => {
  vi.stubGlobal("fetch", realFetch);
  process.env.GEMINI_API_KEY = "";
});

const chatMsg = (agent: ReturnType<typeof request.agent>, message: string, extra: object = {}) =>
  agent.post("/ai/chat").send({ message, ...extra });

/** Fake Gemini: returns the next scripted chat message; embeddings are "unavailable". */
function fakeGemini(script: object[]) {
  process.env.GEMINI_API_KEY = "test-key";
  const calls: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      if (url.endsWith("/embeddings")) return new Response("{}", { status: 404 });
      calls.push(JSON.parse(init.body));
      const message = script.shift() ?? { role: "assistant", content: "ok" };
      return new Response(JSON.stringify({ choices: [{ message }], usage: { total_tokens: 42 } }), { status: 200 });
    }),
  );
  return calls;
}

describe("rule understanding", () => {
  it("parses English and Manglish", () => {
    expect(parseQuery("kakkanad il 50 lakh flat venam").filters).toMatchObject({ type: "apartment", budgetMax: 5_000_000, locality: "Kakkanad" });
    expect(parseQuery("edapally 2bhk vaadaka 30k").filters).toMatchObject({ purpose: "rent", beds: 2, budgetMax: 30_000, locality: "Edappally" });
    expect(parseQuery("compare vyttila and kakkanad")).toMatchObject({ intent: "compare", compare: ["Vyttila", "Kakkanad"] });
    expect(parseQuery("1.5 cr villa").filters.budgetMax).toBe(15_000_000);
  });
});

describe("assistant without an AI key (rules and fallback)", () => {
  it("answers confident searches with ranked cards and useful next questions", async () => {
    const res = await chatMsg(request.agent(app), "50 lakh flat in kakkanad");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("rule");
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.listings.length).toBeLessThanOrEqual(3);
    expect(res.body.listings[0]).toMatchObject({ id: expect.any(String), title: expect.any(String), reasons: expect.any(Array) });
    expect(res.body.listings.every((l: { price: number }) => l.price <= 5_500_000)).toBe(true);
    expect(res.body.chips.length).toBeGreaterThan(0);
  });

  it("refines the previous search", async () => {
    const prev = { purpose: "buy", type: "apartment", budgetMax: 5_000_000, locality: "Kakkanad", city: "Kochi" };
    const res = await chatMsg(request.agent(app), "only homes near metro", { previous: prev });
    expect(res.body.filters).toMatchObject({ ...prev, maxMetroKm: 1 });
  });

  it("compares localities, greets by context, and offers a callback", async () => {
    const agent = request.agent(app);
    const cmp = await chatMsg(agent, "compare kakkanad and edappally");
    expect(cmp.body.compare.map((c: { name: string }) => c.name)).toEqual(["Kakkanad", "Edappally"]);
    const hi = await chatMsg(agent, "hi", { context: { timeZone: "Asia/Dubai" } });
    expect(hi.body.reply).toMatch(/abroad/);
    expect((await chatMsg(agent, "please call me")).body.leadForm).toBe(true);
  });

  it("falls back gracefully on open questions", async () => {
    const res = await chatMsg(request.agent(app), "is it a good time to buy?");
    expect(res.body.mode).toBe("fallback");
    expect(res.body.chips.length).toBeGreaterThan(0);
  });

  it("personalises starters by city with no AI call", async () => {
    const res = await request(app).get("/ai/suggestions").query({ city: "Thiruvananthapuram" });
    expect(res.body.hub).toBe("Kazhakkoottam");
    expect(res.body.headline).toMatch(/Kazhakkoottam/);
  });
});

describe("assistant with the LLM (mocked Gemini)", () => {
  it("uses structured output for unclear searches, then serves repeats from cache", async () => {
    const calls = fakeGemini([
      { role: "assistant", content: JSON.stringify({ intent: "search", purpose: "buy", type: "villa", city: "Kochi", nearHospital: true, budgetMaxInr: 20000000 }) },
    ]);
    const agent = request.agent(app);
    const msg = "something calm for my retired parents in kochi, they need a hospital nearby";
    const first = await chatMsg(agent, msg);
    expect(first.body.mode).toBe("llm");
    expect(first.body.filters).toMatchObject({ type: "villa", city: "Kochi", maxHospitalKm: 2 });
    expect((calls[0] as { response_format: { type: string } }).response_format.type).toBe("json_schema");
    const second = await chatMsg(agent, msg);
    expect(second.body.mode).toBe("cache");
    expect(calls.length).toBe(1);
  });

  it("rejects invalid structured output instead of trusting it", async () => {
    fakeGemini([{ role: "assistant", content: JSON.stringify({ intent: "search", purpose: "buy", beds: 99 }) }]);
    const res = await chatMsg(request.agent(app), "something nice and big please");
    expect(res.body.mode).toBe("fallback");
  });

  it("runs the tool-calling agent and shows the listing it looked at", async () => {
    fakeGemini([
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "listing_details", arguments: JSON.stringify({ id: "L007" }) } }] },
      { role: "assistant", content: "It is **below** the area average, so fairly priced. Demo data." },
    ]);
    const res = await chatMsg(request.agent(app), "is the signature pool villa fairly priced?");
    expect(res.body.mode).toBe("llm");
    expect(res.body.listings.map((l: { id: string }) => l.id)).toEqual(["L007"]);
    expect(res.body.reply).not.toMatch(/\*/); // markdown stripped
  });

  it("enforces the per-visitor daily AI limit, then keeps answering with rules", async () => {
    fakeGemini(Array.from({ length: 10 }, () => ({ role: "assistant", content: JSON.stringify({ intent: "search", purpose: "buy", city: "Kochi" }) })));
    const agent = request.agent(app);
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await chatMsg(agent, `somewhere lovely number ${i} in kochi please`)).body);
    expect(results.slice(0, 3).every((r) => r.mode === "llm")).toBe(true);
    expect(results[3].limited).toBe(true);
    expect(results[3].mode).toBe("fallback");
  });

  it("falls back when every provider fails", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    const res = await chatMsg(request.agent(app), "what's good for a young family?");
    expect(res.body.mode).toBe("fallback");
  });
});

describe("leads and monitoring", () => {
  it("needs consent, then stores a lead visible to the listing owner and admin", async () => {
    const lead = { name: "Asha", phone: "+971 50 123 4567", preferredTime: "Evening", timeZone: "Asia/Dubai", listingIds: ["L005"] };
    expect((await request(app).post("/leads").send(lead)).status).toBe(400);
    expect((await request(app).post("/leads").send({ ...lead, consent: true })).status).toBe(201);

    const owner = request.agent(app);
    await owner.post("/auth/login").send({ email: "owner@example.com", password: DEMO_PASSWORD });
    const mine = await owner.get("/leads/mine");
    expect(mine.body.items.some((l: { name: string }) => l.name === "Asha")).toBe(true);

    const admin = request.agent(app);
    await admin.post("/auth/login").send({ email: "admin@example.com", password: DEMO_PASSWORD });
    expect((await admin.get("/admin/leads")).body.items.length).toBeGreaterThan(0);
    const stats = await admin.get("/admin/ai-stats");
    const modes = stats.body.byMode.map((m: { _id: string }) => m._id);
    expect(modes).toEqual(expect.arrayContaining(["rule", "llm", "fallback", "cache"]));
  });
});
