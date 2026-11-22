import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { Listing } from "../models/listing.js";
import { User } from "../models/user.js";

/**
 * Demo accounts, one per role. Created outside production, or when SEED_DEMO_USERS=true.
 * The demo admin is never created in production: its password is public.
 */
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
  const isProd = process.env.NODE_ENV === "production";
  const wantDemo = !isProd || process.env.SEED_DEMO_USERS === "true";
  const demoUsers = DEMO_USERS.filter((u) => !(isProd && u.role === "admin"));
  const ids: Record<string, unknown> = {};

  if (wantDemo && (force || (await User.countDocuments()) === 0)) {
    if (force) await User.deleteMany({ email: { $in: demoUsers.map((u) => u.email) } });
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 11);
    for (const u of demoUsers) {
      const doc = await User.create({ ...u, passwordHash });
      ids[u.role] = doc._id;
    }
    console.log(`Seeded ${demoUsers.length} demo users`);
  } else {
    for (const u of await User.find({ email: { $in: DEMO_USERS.map((d) => d.email) } }).lean()) ids[u.role] = u._id;
  }

  await ensureAdmin();

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

/**
 * Creates the first real admin from ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters).
 * Runs on every start but only creates the account once; it never changes an existing one.
 */
async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email) return;
  if (password.length < 12) {
    console.warn("ADMIN_EMAIL is set but ADMIN_PASSWORD is shorter than 12 characters: no admin created");
    return;
  }
  if (await User.exists({ email })) return;
  await User.create({ name: "Admin", email, role: "admin", passwordHash: await bcrypt.hash(password, 11) });
  console.log(`Created admin account ${email}`);
}
