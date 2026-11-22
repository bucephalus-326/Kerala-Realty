// Reseed the database: `npm run seed` (keeps data) or `npm run seed -- --reset`.
import { connectDb, disconnectDb } from "../db.js";
import { seedIfEmpty } from "./seed-data.js";

if (!process.env.MONGODB_URI) {
  console.error("Set MONGODB_URI to seed a real database (the in-memory one is seeded automatically on start).");
  process.exit(1);
}
await connectDb();
await seedIfEmpty({ force: process.argv.includes("--reset") });
await disconnectDb();
