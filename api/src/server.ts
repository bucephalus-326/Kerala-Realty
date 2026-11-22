import { config } from "./config.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";
import { seedIfEmpty } from "./scripts/seed-data.js";

await connectDb();
await seedIfEmpty();
createApp().listen(config.port, () => console.log(`API listening on :${config.port}`));
