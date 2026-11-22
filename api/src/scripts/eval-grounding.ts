/**
 * Grounding eval: does the assistant only state facts that are in our data?
 *   npm run eval:grounding            rules and fallbacks only (free, runs in CI)
 *   npm run eval:grounding -- --llm   the full assistant with the LLM agent (~20 Gemini calls)
 *
 * For each question it runs the real assistant against a seeded database and checks:
 *   - cards: every listing shown is live, and its price, place, type and beds match the database;
 *   - filters: every card satisfies the search the assistant says it ran;
 *   - reply text: every rupee amount, "x km" distance, growth %, listing id and "found N" count in the
 *     reply matches a listing it found, the visitor's own budget, or locality data.
 * Writes evals/report-grounding-<mode>.json; exits non-zero below the threshold.
 */
import { readFileSync, writeFileSync } from "node:fs";

const useLlm = process.argv.includes("--llm");
if (!useLlm) for (const k of ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OMNIROUTE_URL"]) process.env[k] = "";
process.env.MONGODB_URI = "";
const THRESHOLD = Number(process.env.EVAL_THRESHOLD ?? (useLlm ? 0.9 : 1));

const { connectDb, disconnectDb } = await import("../db.js");
const { seedIfEmpty } = await import("./seed-data.js");
const { respond } = await import("../ai/assistant.js");
const { searchListings } = await import("../ai/search.js");
const { Listing } = await import("../models/listing.js");
const { amounts, kms, near, percents } = await import("../ai/grounding.js");

type Case = { q: string; previous?: Record<string, unknown> };
type Row = { _id: string; price: number; purpose: string; type: string; beds?: number; locality: string; status: string; nearby?: Record<string, { km: number }>; highlights?: { km: number }[] };
type Locality = { name: string; psf: number; yoy: number; nearby: Record<string, { km: number }> };

const cases: Case[] = JSON.parse(readFileSync(new URL("../../evals/grounding.json", import.meta.url), "utf8"));
const localities: Locality[] = JSON.parse(readFileSync(new URL("../../../web/src/data/generated/localities.json", import.meta.url), "utf8"));

await connectDb();
await seedIfEmpty();

const rows = [];
let passed = 0;
for (const [i, c] of cases.entries()) {
  const problems: string[] = [];
  const res = await respond({ message: c.q, previous: c.previous, context: {} }, `eval:${i}:${Date.now()}`);

  // Everything the reply may talk about: the cards, every listing behind the answer, and the search it ran.
  const ids = new Set([...(res.ids ?? []), ...res.listings.map((l) => l.id)]);
  if (res.filters) for (const r of (await searchListings(res.filters, { limit: 500 })).results) ids.add(r.listing.id);
  const known = (await Listing.find({ _id: { $in: [...ids] } }).lean()) as unknown as Row[];
  const byId = new Map(known.map((l) => [String(l._id), l]));

  // 1. Cards match the database.
  for (const card of res.listings) {
    const db = byId.get(card.id);
    if (!db || db.status !== "published") {
      problems.push(`card ${card.id} is not a live listing`);
      continue;
    }
    for (const k of ["price", "purpose", "type", "beds", "locality"] as const) {
      if (card[k] !== db[k]) problems.push(`card ${card.id} ${k}: shows ${card[k]}, database has ${db[k]}`);
    }
    // 2. Cards satisfy the stated search.
    const f = res.filters;
    if (f?.purpose && db.purpose !== f.purpose) problems.push(`card ${card.id} is for ${db.purpose}, search was ${f.purpose}`);
    if (f?.budgetMax && db.price > f.budgetMax * 1.1) problems.push(`card ${card.id} costs ${db.price}, over the ${f.budgetMax} budget`);
    if (f?.beds && (db.beds ?? 0) < f.beds) problems.push(`card ${card.id} has ${db.beds} beds, search wanted ${f.beds}+`);
    if (f?.type && db.type !== f.type && !(f.type === "villa" && db.type === "house")) problems.push(`card ${card.id} is a ${db.type}, search wanted ${f.type}`);
  }

  // 3. Numbers in the reply come from data.
  const named = localities.filter((l) => res.compare?.some((r) => r.name === l.name) || res.filters?.locality === l.name || c.q.toLowerCase().includes(l.name.toLowerCase()));
  const allowedMoney = [
    ...known.map((l) => l.price),
    ...amounts(c.q),
    ...(res.filters?.budgetMax ? [res.filters.budgetMax, res.filters.budgetMax * 1.2] : []),
    ...(c.previous?.budgetMax ? [Number(c.previous.budgetMax)] : []),
    ...named.map((l) => l.psf),
  ];
  // Text in quotes is an example of what to ask (“2BHK flat in Kakkanad under 50 lakh”), not a claim.
  const claims = res.reply.replace(/[“"][^”"]*[”"]/g, " ");
  for (const x of amounts(claims)) if (!near(x, allowedMoney, 0.02, 1000)) problems.push(`reply mentions ₹${x.toLocaleString("en-IN")}, which no listing or budget has`);

  const allowedKm = [
    ...known.flatMap((l) => [...Object.values(l.nearby ?? {}).map((n) => n.km), ...(l.highlights ?? []).map((h) => h.km)]),
    ...named.flatMap((l) => Object.values(l.nearby).map((n) => n.km)),
    2.5, // the search radius around a named place
  ];
  for (const x of kms(claims)) if (!near(x, allowedKm, 0.1, 0.15) && !allowedKm.some((a) => Math.round(a) === x)) problems.push(`reply mentions ${x} km, which no listing or place has`);

  const budget = res.filters?.budgetMax;
  const allowedPct = [...named.map((l) => l.yoy), ...(budget ? known.map((l) => Math.round(Math.abs(1 - l.price / budget) * 100)) : [])]; // "11% under your budget"
  for (const x of percents(claims)) if (!near(x, allowedPct, 0, 0.1)) problems.push(`reply mentions ${x}%, which no locality's yearly growth matches`);

  for (const m of res.reply.matchAll(/\bL\d{3,6}\b/g)) if (!byId.has(m[0])) problems.push(`reply mentions ${m[0]}, not one of the listings found`);
  const found = /\bfound (\d+)\b/i.exec(res.reply);
  if (found && Number(found[1]) !== res.total) problems.push(`reply says "found ${found[1]}", the search returned ${res.total}`);

  if (!problems.length) passed++;
  rows.push({ q: c.q, mode: res.mode, reply: res.reply, cards: res.listings.map((l) => l.id), pass: !problems.length, problems });
  if (useLlm && res.mode === "llm") await new Promise((r) => setTimeout(r, 4500)); // stay under the free per-minute limit
}

const rate = passed / cases.length;
const report = { mode: useLlm ? "llm" : "rules", at: new Date().toISOString(), cases: cases.length, passed, passRate: +rate.toFixed(3), modes: countBy(rows.map((r) => r.mode)), rows };
writeFileSync(new URL(`../../evals/report-grounding-${report.mode}.json`, import.meta.url), JSON.stringify(report, null, 2));
console.log(`grounding (${report.mode}): ${passed}/${cases.length} answers fully grounded (${(rate * 100).toFixed(0)}%), answered by`, report.modes);
for (const r of rows.filter((x) => !x.pass)) console.log(`  ✗ ${r.q}\n      ${r.problems.join("\n      ")}\n      reply: ${r.reply}`);
await disconnectDb();
if (rate < THRESHOLD) process.exit(1);

function countBy(xs: string[]) {
  return xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});
}
