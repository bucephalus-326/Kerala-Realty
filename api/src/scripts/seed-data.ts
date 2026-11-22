import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { Listing } from "../models/listing.js";
import { User } from "../models/user.js";

/** Demo accounts, one per role. Created outside production, or when SEED_DEMO_USERS=true. */
export const DEMO_PASSWORD = "demo-pass-2026";
export const DEMO_USERS = [
  { name: "Meera Buyer", email: "buyer@example.com", role: "buyer" },
  { name: "Arun Nair", email: "nri@example.com", role: "nri", preferences: { currency: "AED", timeZone: "Asia/Dubai", country: "UAE" } },
  { name: "Joseph Owner", email: "owner@example.com", role: "owner", verification: "verified" },
  { name: "Periyar Homes", email: "agent@example.com", role: "agent", verification: "verified", company: "Periyar Homes" },
  { name: "Site Admin", email: "admin@example.com", role: "admin" },
] as const;

const LISTINGS_FILE = new URL("../../../web/src/data/generated/listings.json", import.meta.url);

type RawListing = { id: string; coords: [number, number]; postedBy: { kind: string } } & Record<string, unknown>;

export async function seedIfEmpty({ force = false } = {}) {
  const wantDemo = process.env.NODE_ENV !== "production" || process.env.SEED_DEMO_USERS === "true";
  const ids: Record<string, unknown> = {};

  if (wantDemo && (force || (await User.countDocuments()) === 0)) {
    if (force) await User.deleteMany({ email: { $in: DEMO_USERS.map((u) => u.email) } });
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 11);
    for (const u of DEMO_USERS) {
      const doc = await User.create({ ...u, passwordHash });
      ids[u.role] = doc._id;
    }
    console.log(`Seeded ${DEMO_USERS.length} demo users`);
  } else {
    for (const u of await User.find({ email: { $in: DEMO_USERS.map((d) => d.email) } }).lean()) ids[u.role] = u._id;
  }

  if (force || (await Listing.countDocuments()) === 0) {
    const raw = JSON.parse(await readFile(LISTINGS_FILE, "utf8")) as RawListing[];
    if (force) await Listing.deleteMany({});
    await Listing.insertMany(
      raw.map(({ id, coords, ...rest }) => ({
        ...rest,
        _id: id,
        location: { type: "Point", coordinates: coords },
        status: "published",
        ownerId: rest.postedBy.kind === "owner" ? ids.owner : ids.agent,
      })),
    );
    console.log(`Seeded ${raw.length} listings`);
  }
}
