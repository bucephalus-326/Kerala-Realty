import { config } from "./config.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";
import { seedIfEmpty } from "./scripts/seed-data.js";
import { warmStarters } from "./ai/assistant.js";
import { aiEnabled } from "./ai/provider.js";
import { ensureEmbeddings } from "./ai/search.js";

await connectDb();
await seedIfEmpty();
await warmStarters();
// Embed listings for semantic ranking in the background (one batched call; skipped without a key).
if (aiEnabled()) ensureEmbeddings().then((n) => n && console.log(`Embedded ${n} listings`)).catch(() => {});
createApp().listen(config.port, () => console.log(`API listening on :${config.port}`));
