import { config } from "./config.js";
import { connectDb, disconnectDb } from "./db.js";
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
const server = createApp().listen(config.port, () => console.log(`API listening on :${config.port}`));

// Render sends SIGTERM on every deploy: finish open requests, then close the database.
process.once("SIGTERM", () => {
  server.close(() => disconnectDb().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10_000).unref();
});
