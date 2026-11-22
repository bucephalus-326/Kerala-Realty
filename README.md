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

## Run
```
cd web
npm install
npm run dev
```

Listings are dummy data in `web/src/data/listings.ts`. Photos come from Unsplash (free licence) and are stored in `web/public/img`.

## Screenshots

| Search flow | Mobile |
|---|---|
| ![Search flow](docs/screenshots/2-desktop-search-flow.jpg) | ![Mobile](docs/screenshots/5-mobile-hero.jpg) |

More in `docs/screenshots/`.
