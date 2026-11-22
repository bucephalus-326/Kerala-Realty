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

Four tools are set up for this repo. Use them when the situation calls for it, not on every task.

### Ponytail: lean code and plain-English review
<https://github.com/DietrichGebert/ponytail> (MIT)
- **What:** a "lazy senior developer" skill. Before writing code it checks, in order: does this need to exist, is it already in the codebase, does the standard library do it. It keeps security, data-loss handling and accessibility, and leaves one small test for risky logic.
- **Installed:** listed as a plugin in `.claude/settings.json` (`ponytail@ponytail`). Claude Code offers to install it when the repo is opened; or run `/plugin marketplace add DietrichGebert/ponytail` then `/plugin install ponytail@ponytail`. The review skill is also available here as `ponytail-review`.
- **Use when:** finishing a stage or a large change → `/ponytail-review` (diff) or `/ponytail-audit` (whole repo). `/ponytail-debt` collects deferred `shortcut:` comments.

### Agent Skills (Addy Osmani): engineering workflow skills
<https://github.com/addyosmani/agent-skills> (MIT)
- **What:** 26 skills and 10 commands for the full cycle: `/spec`, `/plan`, `/build`, `/test`, `/constraints`, `/agent-skills:review` (namespaced, because Claude Code has its own `/review`), `/webperf`, `/a11y`, `/code-simplify`, `/ship`. Skills such as `security-and-hardening`, `frontend-ui-engineering` and `api-and-interface-design` also activate on their own.
- **Installed:** listed as a plugin in `.claude/settings.json` (`agent-skills@addy-agent-skills`); or `/plugin marketplace add addyosmani/agent-skills` then `/plugin install agent-skills@addy-agent-skills`.
- **Use when:** a new stage starts (`/spec`, `/plan`); before merging (`/agent-skills:review`); after UI work (`/a11y`, `/webperf`); before going live (`/ship`, plus `security-and-hardening` for auth, uploads and payments).

### Graphify: code knowledge graph
<https://github.com/Graphify-Labs/graphify>
- **What:** maps the repo into a graph of files, functions, components and how they connect, using tree-sitter (local, no AI calls, about 3 seconds here). Query it instead of grepping across many files.
- **Installed:** CLI `pip install graphifyy` (or `uv tool install graphifyy`); project skill in `.claude/skills/graphify/` (invoke with `/graphify`). `.graphifyignore` skips generated data, photos and screenshots. Output goes to `graphify-out/` (git-ignored; rebuild with `graphify update .`). Its optional always-on hooks are deliberately not enabled.
- **Use when:** a question spans many files (how does X flow through the system, what breaks if Y changes) or before a cross-cutting refactor:
  ```bash
  graphify update .                       # rebuild after code changes (local, free)
  graphify query "how does a buyer book a visit"
  graphify path "Listing" "VisitDialog"   # how two things connect
  graphify explain "searchListings"
  ```
  For a single known file or symbol, plain search is still faster. Note: `graphify update .` (code) is fully local; the full `/graphify` pipeline also reads docs and images with an AI model (Gemini if `GEMINI_API_KEY` is set), so keep private files out of what it scans.

### OmniRoute: free AI gateway (assistant fallback)
<https://github.com/diegosouzapw/OmniRoute>
- **What:** a self-hosted, OpenAI-compatible gateway that routes requests across many free-tier AI providers using your own accounts, with automatic fallback.
- **Installed:** wired into `api/src/ai/provider.ts` as a fallback after Gemini; it switches on when `OMNIROUTE_URL` is set. Not running in the cloud container (it needs your provider accounts).
- **Set up:** `npm install -g omniroute`, start it, open its dashboard on port 20128 and connect free providers, then copy the key from Dashboard → Endpoints. On the API set `OMNIROUTE_URL=http://localhost:20128/v1`, `OMNIROUTE_API_KEY=<that key>`, `OMNIROUTE_MODELS=auto`. On a server, run it headless: `omniroute serve --headless`.
- **Use when:** Gemini's free tier is busy or used up, or to test the assistant with other free models.

### Built-in Claude Code skills
`/security-review` after auth, upload or payment changes; `/code-review` before merging a stage; `/simplify` after big features. Add a project skill under `.claude/skills/` when a workflow repeats (e.g. "add a listing field end to end").
