/**
 * Evals for query understanding.
 *   npm run eval            rules only (free, runs anywhere)
 *   npm run eval -- --llm   also scores the LLM's structured output (uses ~30 Gemini calls)
 * Writes evals/report-<mode>.json and exits non-zero if the pass rate drops below the threshold.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseQuery, type Understanding } from "../ai/parse.js";
import { llmExtract } from "../ai/assistant.js";

type Expect = Record<string, unknown>;
const cases: { q: string; expect: Expect }[] = JSON.parse(readFileSync(new URL("../../evals/cases.json", import.meta.url), "utf8"));
const useLlm = process.argv.includes("--llm");
const THRESHOLD = Number(process.env.EVAL_THRESHOLD ?? 0.9);

function flatten(u: Understanding): Record<string, unknown> {
  return { intent: u.intent, compare: u.compare, ...u.filters };
}

async function viaLlm(q: string): Promise<Record<string, unknown>> {
  const x = await llmExtract(q);
  return { intent: x.intent, compare: x.compare, ...x.filters };
}

const fieldHits: Record<string, { ok: number; n: number }> = {};
const rows = [];
let passed = 0;
for (const c of cases) {
  const started = Date.now();
  let got: Record<string, unknown>;
  const misses: string[] = [];
  try {
    got = useLlm ? await viaLlm(c.q) : flatten(parseQuery(c.q));
  } catch (e) {
    got = {};
    misses.push(`error: ${(e as Error).message.slice(0, 160)}`);
  }
  for (const [k, v] of Object.entries(c.expect)) {
    const ok = JSON.stringify(got[k]) === JSON.stringify(v);
    fieldHits[k] ??= { ok: 0, n: 0 };
    fieldHits[k].n++;
    if (ok) fieldHits[k].ok++;
    else misses.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got[k])}`);
  }
  if (!misses.length) passed++;
  if (useLlm) await new Promise((r) => setTimeout(r, 4500)); // ~13 calls/min: under the free per-minute limit
  rows.push({ q: c.q, pass: !misses.length, misses, ms: Date.now() - started });
}

const rate = passed / cases.length;
const report = {
  mode: useLlm ? "llm" : "rules",
  at: new Date().toISOString(),
  cases: cases.length,
  passed,
  passRate: +rate.toFixed(3),
  fields: Object.fromEntries(Object.entries(fieldHits).map(([k, v]) => [k, +(v.ok / v.n).toFixed(3)])),
  failures: rows.filter((r) => !r.pass),
};
writeFileSync(new URL(`../../evals/report-${report.mode}.json`, import.meta.url), JSON.stringify(report, null, 2));
console.log(`${report.mode}: ${passed}/${cases.length} cases (${(rate * 100).toFixed(0)}%)`);
console.log("per field:", report.fields);
for (const f of report.failures) console.log(`  ✗ ${f.q}\n      ${f.misses.join("\n      ")}`);
if (rate < THRESHOLD) process.exit(1);
