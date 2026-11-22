import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { DEMO_PASSWORD, seedIfEmpty } from "../src/scripts/seed-data.js";

const app = createApp();
type Agent = ReturnType<typeof request.agent>;
let admin: Agent;

async function signIn(email: string, password = DEMO_PASSWORD) {
  const a = request.agent(app);
  const res = await a.post("/auth/login").send({ email, password });
  return Object.assign(a, { status: res.status, body: res.body });
}
async function register(email: string, role: string) {
  const a = request.agent(app);
  const res = await a.post("/auth/register").send({ name: "Test Person", email, password: "long-enough-1", role });
  return { agent: a, id: res.body.user.id as string };
}

beforeAll(async () => {
  await connectDb();
  await seedIfEmpty();
  admin = await signIn("admin@example.com");
});
afterAll(disconnectDb);

describe("admin access", () => {
  it("is admin-only", async () => {
    const owner = await signIn("owner@example.com");
    for (const path of ["/admin/users", "/admin/analytics", "/admin/reports", "/admin/settings", "/admin/verifications"]) {
      expect((await owner.get(path)).status).toBe(403);
    }
    expect((await request(app).get("/admin/users")).status).toBe(401);
  });
});

describe("user management", () => {
  it("searches users", async () => {
    const res = await admin.get("/admin/users").query({ q: "periyar" });
    expect(res.body.items.map((u: { email: string }) => u.email)).toEqual(["agent@example.com"]);
  });

  it("applies a role change to an existing session immediately", async () => {
    const { agent, id } = await register("promote@example.com", "buyer");
    expect((await agent.put("/me/saved/L001").send({})).status).toBe(200);
    await admin.patch(`/admin/users/${id}`).send({ role: "owner" });
    // The old token said "buyer"; it is now revoked, so the session is signed out.
    expect((await agent.get("/auth/me")).status).toBe(401);
    const again = await signIn("promote@example.com", "long-enough-1");
    expect(again.body.user.role).toBe("owner");
  });

  it("suspends accounts: existing sessions end and sign-in is refused", async () => {
    const { agent, id } = await register("suspend@example.com", "buyer");
    await admin.patch(`/admin/users/${id}`).send({ status: "suspended", suspendedReason: "Spam enquiries" });
    expect((await agent.get("/auth/me")).status).toBe(401);
    const login = await request(app).post("/auth/login").send({ email: "suspend@example.com", password: "long-enough-1" });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("suspended");
    await admin.patch(`/admin/users/${id}`).send({ status: "active" });
    expect((await signIn("suspend@example.com", "long-enough-1")).status).toBe(200);
  });

  it("won't let admins demote or suspend themselves", async () => {
    const me = (await admin.get("/auth/me")).body.user.id;
    expect((await admin.patch(`/admin/users/${me}`).send({ role: "buyer" })).status).toBe(400);
    expect((await admin.patch(`/admin/users/${me}`).send({ status: "suspended" })).status).toBe(400);
  });
});

describe("verification", () => {
  it("lists pending owners with their documents and verifies them, badging their listings", async () => {
    const { agent, id } = await register("newowner@example.com", "owner");
    await agent.post("/documents").set("Content-Type", "application/pdf").set("X-KR-Upload", "1").set("X-Doc-Kind", "id_proof").send(Buffer.from("%PDF-1.4 id"));
    const queue = await admin.get("/admin/verifications");
    const row = queue.body.items.find((r: { user: { id: string } }) => r.user.id === id);
    expect(row.documents[0].kind).toBe("id_proof");
    const doc = await admin.post(`/admin/documents/${row.documents[0].id}/review`).send({ decision: "verified" });
    expect(doc.body.review).toBe("verified");
    // A draft of theirs, approved after verification, carries the verified badge.
    const d = await agent.post("/portal/listings").send({ title: "Owner flat to verify", purpose: "rent", type: "apartment" });
    await admin.patch(`/admin/users/${id}`).send({ verification: "verified" });
    expect((await agent.get(`/portal/listings/${d.body.id}`)).body.verified).toBe(true);
  });
});

describe("listings moderation", () => {
  it("requires a note to reject, and can feature and take down live listings", async () => {
    const owner = await signIn("owner@example.com");
    const d = await owner.post("/portal/listings").send({ title: "Moderation test villa", purpose: "buy", type: "villa" });
    await owner.patch(`/portal/listings/${d.body.id}`).send({
      price: 12_000_000, beds: 3, baths: 3, builtUpSqft: 2000, landCents: 5, coords: [76.3181, 9.969], locality: "Vyttila", city: "Kochi", district: "Ernakulam",
      description: "Bright 3BHK villa near Vyttila hub with a garden and covered parking.", images: ["/img/villa-1.jpg"], rera: { status: "not_required" },
    });
    await owner.post(`/portal/listings/${d.body.id}/submit`).send({});
    const queue = await admin.get("/admin/listings");
    expect(queue.body.items.find((l: { id: string }) => l.id === d.body.id).owner.verification).toBe("verified");
    expect((await admin.post(`/admin/listings/${d.body.id}/review`).send({ decision: "reject" })).status).toBe(400);
    expect((await admin.post(`/admin/listings/${d.body.id}/review`).send({ decision: "approve" })).body.status).toBe("published");

    expect((await admin.post(`/admin/listings/${d.body.id}/feature`).send({ featured: true })).body.featured).toBe(true);
    const pub = await request(app).get(`/listings/${d.body.id}`);
    expect(pub.body.featured).toBe(true);

    expect((await admin.post(`/admin/listings/${d.body.id}/takedown`).send({ reason: "Photos belong to another property" })).body.status).toBe("rejected");
    expect((await request(app).get(`/listings/${d.body.id}`)).status).toBe(404);
    const mine = await owner.get(`/portal/listings/${d.body.id}`);
    expect(mine.body.reviewNote).toMatch(/another property/);
    expect(mine.body.featured).toBe(false);
  });
});

describe("reports", () => {
  it("lets visitors report once, and admins dismiss or take down", async () => {
    const visitor = request.agent(app);
    expect((await visitor.post("/listings/L002/report").send({ reason: "already_sold", details: "Owner said it was sold last week" })).status).toBe(201);
    expect((await visitor.post("/listings/L002/report").send({ reason: "already_sold" })).body.duplicate).toBe(true);
    expect((await visitor.post("/listings/NOPE/report").send({ reason: "fake" })).status).toBe(404);
    const buyer = await signIn("buyer@example.com");
    await buyer.post("/listings/L002/report").send({ reason: "wrong_price" });

    const open = await admin.get("/admin/reports");
    const mine = open.body.items.filter((r: { listingId: string }) => r.listingId === "L002");
    expect(mine.length).toBe(2);
    expect(mine.map((r: { reporter: string }) => r.reporter)).toEqual(expect.arrayContaining(["Meera Buyer", "Anonymous visitor"]));
    expect((await admin.get("/admin/listings").query({ status: "published", q: "l002" })).body.items[0].openReports).toBe(2);

    await admin.post(`/admin/reports/${mine[0].id}`).send({ action: "takedown", note: "Confirmed sold" });
    expect((await request(app).get("/listings/L002")).status).toBe(404);
    expect((await admin.get("/admin/reports")).body.items.filter((r: { listingId: string }) => r.listingId === "L002").length).toBe(0);
  });
});

describe("analytics, activity log and settings", () => {
  it("returns totals, per-day series and top listings", async () => {
    await request(app).post("/listings/L001/view").send({});
    const res = await admin.get("/admin/analytics").query({ days: 7 });
    expect(res.body.series.views).toHaveLength(7);
    expect(res.body.totals.users).toBeGreaterThan(5);
    expect(res.body.topListings[0]).toMatchObject({ id: "L001", views: 1 });
  });

  it("filters the activity log and names the actor", async () => {
    const res = await admin.get("/admin/audit").query({ action: "admin." });
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((a: { action: string }) => a.action.startsWith("admin."))).toBe(true);
    expect(res.body.items[0].actor.email).toBe("admin@example.com");
  });

  it("publishes an announcement and changes AI limits live", async () => {
    await admin.put("/admin/settings").send({ announcement: { text: "Office closed for Onam, 4–5 Sept", active: true }, ai: { enabled: false } });
    expect((await request(app).get("/settings/public")).body.announcement).toMatch(/Onam/);
    // With AI switched off, an unclear question gets the rule-based fallback even with a key set.
    process.env.GEMINI_API_KEY = "test-key";
    try {
      const r = await request(app).post("/ai/chat").send({ message: "somewhere calm for retired parents please" });
      expect(r.body.mode).toBe("fallback");
      expect(r.body.limited).toBe(true);
    } finally {
      process.env.GEMINI_API_KEY = "";
    }
    await admin.put("/admin/settings").send({ announcement: { text: "", active: false }, ai: { enabled: true } });
    expect((await request(app).get("/settings/public")).body.announcement).toBeNull();
  });
});
