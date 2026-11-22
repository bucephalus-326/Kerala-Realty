# Kerala Realty: full-stack real estate web app (demo)

![Home page](docs/screenshots/1-desktop-hero.jpg)

"Tharavad" is a placeholder brand. Rename it in `web/src/config/site.ts`.

## Stage 1: design system and home page (done)
- Next.js 15 + Tailwind v4, dark (default) and light themes
- Hero with search (buy/rent, location, type, budget, cents ⇄ sq.ft, INR/AED/USD/QAR)
- Results flow: our recommendation (top 3 with reasons), then all matches, then follow-up questions
- Currency suggested from browser time zone (no tracking)
- Map preview, localities, NRI concierge, owner/agent call to action, mobile tab bar

## Stage 2: data (done)
- 60 listings across Kochi, Trivandrum and Kozhikode (19 hand-written + 41 generated)
- About 2,000 real places from OpenStreetMap: metro and Water Metro stops, rail, IT parks, schools, hospitals, malls, airports
- Each listing knows its nearest places, school and hospital counts, and demo flood risk
- Follow-up questions use these facts ("Only homes within 1 km of a metro", "Hide flood-prone pockets", "Compare Kakkanad with Edappally")
- Price grid for the heatmap. See [`data/README.md`](data/README.md)

## Stage 3: interactive map (done)
`/map`: MapLibre GL + deck.gl on OpenFreeMap tiles (free, no API key), restyled dark and light.

- Layers you can toggle: price heat (2D heatmap, or 3D hex columns that shrink as you zoom in), listing density, metro lines with animated light pulses (Pink Line marked under construction, approximate route), Water Metro, IT parks, hospitals, schools, demo flood zones
- Price pills for every listing; they collapse to dots when zoomed out
- Select a home: 1/2/3 km rings and 3D arcs to the nearest metro, IT park, hospital and Water Metro, with distances
- Draw a search area on the map to filter homes inside it
- Kochi, Trivandrum and Kozhikode camera presets; side list of homes in view with buy/rent, type and budget filters
- Mobile: flat 2D map, bottom sheet list, layers behind a button
- Every card's locality links to `/map?listing=<id>`

![Map](docs/screenshots/9-map-selected.jpg)

## Stage 4: accounts, roles and consent (done)
New `api/` service: Node + Express + MongoDB (Mongoose), TypeScript.

- **Six roles with RBAC from day one:** guest, buyer, NRI buyer, owner, agent/builder, admin. Every API route checks a permission (`api/src/auth/rbac.ts`); the UI only hides buttons.
- **Sign in / register** (`/signin`) with a role picker. Owners and agents start in "verification pending". Homes saved while signed out move into the account.
- **Sessions:** signed JWT in an http-only, SameSite=Lax cookie. The web app proxies `/api/*` to the API, so the cookie is first-party. Writes must be JSON (CSRF guard). Login is rate limited and gives the same error for unknown email and wrong password.
- **Buyers:** saved homes synced to the account, visit and live-video-tour booking (9 AM to 8 PM IST, shown in IST and your own time zone), cancel visits.
- **NRI dashboard:** advisor + WhatsApp, two clocks, currency and time zone preferences, shortlist priced in INR/AED/USD/QAR, visits in both time zones, concierge requests.
- **Owners/agents:** their own listings with visit-request counts (adding and editing comes with the owner portal).
- **Admin:** users and the audit trail.
- **DPDP consent banner:** allow all, essential only, or customise; nothing optional runs before a choice. Stored locally and recorded by the API with a random id (no IP). "Privacy choices" in the footer reopens it; `/privacy` has the notice.
- **Audit trail** of sign-ins, failed logins, registrations, bookings and concierge requests.
- 18 API tests (`cd api && npm test`) run against a real temporary MongoDB.

## Stage 5: AI assistant (done)
A chat assistant on every page (side panel on tablet/desktop, bottom sheet on phones) that searches verified listings and drives the home page: **our recommendation → all matching listings → next questions**.

How it stays within free API limits:

| Step | What happens | AI cost |
|---|---|---|
| 1. Rules | English + Manglish parser (`api/src/ai/parse.ts`): place, budget, BHK, type, buy/rent, metro, flood, schools, hospital, compare, call-back | free |
| 2. Structured output | Unclear searches go to Gemini with a JSON schema; the result is validated with Zod before use | 1 call |
| 3. RAG | Hard filters + 2.5 km radius in MongoDB, then ranking by budget fit, K-RERA, commute, flood risk and Gemini embeddings of each listing | embeddings once per listing |
| 4. Agent | Open questions ("is this villa fairly priced?") run a tool-calling loop over our data: `search_listings`, `find_listing`, `listing_details` (with price check), `compare_localities`, `offer_callback`; max 4 steps | 1–4 calls |
| 5. Guard rails | 24 h answer cache, 15 AI answers per visitor per day, 800 per day site-wide, retry then fall back across models (and optional Groq/OpenRouter keys); if all fail, rules still answer | – |

- **Personalised, with consent:** with "personalisation" allowed, device, time zone and currency shape the suggestions (NRI time zones get video-tour and advisor prompts); with "location" allowed, the city comes from Vercel's edge headers (`web/src/app/api/geo`), no third-party lookup. A suggestion such as "Looking for a ₹70 lakh flat in Kakkanad?" (the city's median flat price) appears a few seconds after landing.
- **Lead capture:** call-back form in the chat with explicit consent; leads show for the listing's owner/agent and for admins.
- **Evals:** 30 English/Manglish cases in `api/evals/cases.json`. `npm run eval` scores the rules (free); `npm run eval -- --llm` scores Gemini's structured output. Latest: rules 30/30, Gemini 29/30 (the miss was a provider outage). Reports in `api/evals/`.
- **Monitoring:** every turn logs mode, intent, latency, tokens, tools and errors (no message text). Admins see it on their dashboard.

Set `GEMINI_API_KEY` on the API host to turn the AI on; without it the assistant runs on rules only. See `api/.env.example` for the optional fallback keys and limits.

![Assistant](docs/screenshots/16-assistant-flow.jpg)

## Stage 6: owner and agent portal (in progress: review fixes pending)
- `/portal`: listings with views, saves, visits and leads; visit requests (confirm, decline, mark done; buyer contact shared only after confirming); enquiries; document vault and profile verification uploads.
- Six-step listing editor: basics, location (map pin; nearby places and flood risk computed on save), details (price, area, amenities, K-RERA with format check, new-project fields for agents), photos (resized in the browser to WebP, reorder, cover) and video link, private documents (SHA-256 fingerprint, every view audited), review.
- Lifecycle: draft → in review → live → sold / rented / paused. Price and description edits stay live; location and type changes go back to review. Admin approve/reject endpoint (UI comes with the admin console).
- Public listing page `/listings/[id]` (server-rendered from the API) and the whole site now reads live listings from the API, so new homes appear in search, the map and the assistant.
- Files are stored in MongoDB GridFS (no extra service). 47 API tests.

Open items from the stage 6 Ponytail review are listed in the commit message and will be fixed before merging.

## Run locally

Two terminals:

```bash
cd api && npm install && npm run dev      # http://localhost:4000, in-memory MongoDB, demo data seeded
```

```bash
cd web && npm install && npm run dev      # http://localhost:3000
```

Demo accounts (local only) are on the sign-in page: buyer, NRI, owner, agent and admin `@example.com`, password `demo-pass-2026`.

| Variable | Where | What |
|---|---|---|
| `API_URL` | web | API base URL for the `/api` proxy (default `http://localhost:4000`) |
| `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS` | web | `false` hides the demo-account buttons |
| `MONGODB_URI` | api | MongoDB Atlas connection string (empty locally = in-memory) |
| `JWT_SECRET` | api | long random string; required in production |
| `SEED_DEMO_USERS` | api | `true` seeds demo accounts in production |
| `GEMINI_API_KEY` | api | turns on the AI assistant (free tier works) |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY` | api | optional free fallbacks when Gemini is busy |
| `AI_DAILY_LIMIT`, `AI_GLOBAL_DAILY_LIMIT` | api | AI answers per visitor / per day (default 15 / 800) |

Listings and places are generated data (see [`data/README.md`](data/README.md)). Photos come from Unsplash (free licence) and are stored in `web/public/img`.

## Screenshots

| Search flow | Mobile |
|---|---|
| ![Search flow](docs/screenshots/2-desktop-search-flow.jpg) | ![Mobile](docs/screenshots/5-mobile-hero.jpg) |

More in `docs/screenshots/`.
