# Kerala Realty: notes for Claude Code

Demo real-estate platform for Kerala (brand placeholder "Tharavad", set in `web/src/config/site.ts`).
Built in stages on branches `stage-1-home` … `stage-N-*`; each stage branches from the previous one.

## Layout
- `web/` Next.js 15 (App Router) + Tailwind v4. Calls the API through `/api/*` (rewritten to `API_URL`), so session cookies stay first-party.
- `api/` Express 5 + MongoDB (Mongoose), TypeScript, ESM. In-memory MongoDB when `MONGODB_URI` is empty.
- `scripts/` data pipeline: `fetch-osm.mjs` (OpenStreetMap via Overpass) → `build-data.mjs` → `web/src/data/generated/*.json`.
- `data/` seeds and raw OSM extracts (see `data/README.md`).
- `docs/screenshots/` one set per stage.

## Commands
```bash
cd api && npm run dev        # API on :4000, seeds demo data
cd api && npm test           # vitest against a temporary MongoDB
cd api && npm run eval       # assistant query-understanding evals (add -- --llm for Gemini)
cd web && npm run dev        # site on :3000
cd web && npm run build && npm run lint
node scripts/build-data.mjs  # regenerate listings, places, price grid
```
In this cloud container, Node needs `NODE_USE_ENV_PROXY=1` for outbound calls, and Gemini runs with `GEMINI_API_KEY=proxy-injected` (the proxy adds the real key).

## Rules of the codebase
- **RBAC on the server.** Every API route checks a permission from `api/src/auth/rbac.ts`. The UI only hides buttons.
- **Writes are JSON** (CSRF guard in `api/src/auth/session.ts`); file uploads use raw bodies plus the `X-KR-Upload: 1` header.
- **Never invent facts in the assistant.** Listings, prices and distances come from the database or OSM data; LLM output is validated with Zod.
- **Free-tier first.** Rules before LLM calls; cache; per-visitor and global daily caps; fall back instead of failing.
- **Consent (DPDP).** Location, device and analytics data only after the visitor's choice in the consent banner.
- Demo data is labelled as demo (prices, flood zones). Keep it that way until real data replaces it.
- Verify UI changes in a real browser (Playwright), desktop and phone, dark and light.

## Tools to use when needed
| Tool | What it is | When to use it here |
|---|---|---|
| **Ponytail** | The `ponytail-review` skill: a plain-English quality review (correct, safe, holds under load, tested, fast, lean). | At the end of each stage, or before merging a large change, to catch over-engineering and gaps. Run `/ponytail-review`. |
| **OmniRoute** | A self-hosted, OpenAI-compatible AI router that spreads requests over free model providers. | As a fallback when Gemini's free tier is busy or exhausted. Set `OMNIROUTE_URL` (and `OMNIROUTE_API_KEY`, `OMNIROUTE_MODELS`) on the API; `api/src/ai/provider.ts` tries it after Gemini. Not installed in this container. |
| **Graphify** | Builds a knowledge graph of a codebase or folder so an agent can navigate it without reading every file. | When the repo grows large enough that finding the right files gets slow: map `api/src` and `web/src` before cross-cutting refactors. Not installed in this container; install it from its own README first. |
| **Agent Skills** | Packaged instructions Claude Code loads on demand (`/code-review`, `/security-review`, `/simplify`, `ponytail-review`, …), plus project skills in `.claude/skills/`. | `/security-review` after auth, upload or payment changes; `/code-review` before merging a stage; `/simplify` after big features. Add a project skill when a workflow repeats (e.g. "add a listing field end to end"). |
