import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/db.js";
import mongoose from "mongoose";
import { ListingView } from "../src/models/listing.js";
import { DEMO_PASSWORD, seedIfEmpty } from "../src/scripts/seed-data.js";

const app = createApp();
type Agent = ReturnType<typeof request.agent>;
let owner: Agent, agent: Agent, buyer: Agent, admin: Agent;

async function signIn(email: string) {
  const a = request.agent(app);
  expect((await a.post("/auth/login").send({ email, password: DEMO_PASSWORD })).status).toBe(200);
  return a;
}
// 1×1 PNG and a minimal PDF header: enough for the magic-byte check.
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const PDF = Buffer.from("%PDF-1.4\n%demo title deed\n");
const upload = (a: Agent, path: string, body: Buffer, type: string, headers: Record<string, string> = {}) =>
  a.post(path).set("Content-Type", type).set("X-KR-Upload", "1").set(headers).send(body);

let draftId = "";
let photoUrl = "";

beforeAll(async () => {
  await connectDb();
  await seedIfEmpty();
  [owner, agent, buyer, admin] = await Promise.all(["owner", "agent", "buyer", "admin"].map((r) => signIn(`${r}@example.com`)));
});
afterAll(disconnectDb);

describe("photos", () => {
  it("stores real images and serves them publicly", async () => {
    const res = await upload(owner, "/media", PNG, "image/png", { "X-File-Name": "front.png" });
    expect(res.status).toBe(201);
    photoUrl = res.body.url;
    const got = await request(app).get(`/media/${res.body.id}`);
    expect(got.status).toBe(200);
    expect(got.headers["content-type"]).toBe("image/png");
  });

  it("rejects fake images, missing CSRF header and non-portal roles", async () => {
    expect((await upload(owner, "/media", Buffer.from("not an image"), "image/png")).status).toBe(415);
    expect((await owner.post("/media").set("Content-Type", "image/png").send(PNG)).status).toBe(415);
    expect((await upload(buyer, "/media", PNG, "image/png")).status).toBe(403);
  });
});

describe("listing lifecycle", () => {
  it("creates a draft with a new id and lists what's missing", async () => {
    const res = await owner.post("/portal/listings").send({ title: "Sunny 3BHK Home", purpose: "buy", type: "house" });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^L\d{3}$/);
    expect(Number(res.body.id.slice(1))).toBeGreaterThan(60);
    expect(res.body.status).toBe("draft");
    expect(Object.keys(res.body.missing)).toEqual(expect.arrayContaining(["price", "coords", "images", "beds"]));
    draftId = res.body.id;
  });

  it("validates location, K-RERA and video links", async () => {
    expect((await owner.patch(`/portal/listings/${draftId}`).send({ coords: [77.6, 12.97] })).status).toBe(400); // Bengaluru
    const rera = await owner.patch(`/portal/listings/${draftId}`).send({ rera: { status: "registered", number: "12345" } });
    expect(rera.status).toBe(400);
    expect((await owner.patch(`/portal/listings/${draftId}`).send({ videoUrl: "https://evil.example/x" })).status).toBe(400);
  });

  it("computes nearby places and flood risk from the pin", async () => {
    const res = await owner.patch(`/portal/listings/${draftId}`).send({ coords: [76.3083, 10.0261], locality: "Edappally", city: "Kochi", district: "Ernakulam" });
    expect(res.status).toBe(200);
    expect(res.body.nearby.metro.name).toMatch(/Edappally/);
    expect(res.body.highlights.length).toBeGreaterThan(0);
    expect(res.body.flood.level).toBe("low");
  });

  it("refuses to submit until complete, then goes to review and stays private", async () => {
    const early = await owner.post(`/portal/listings/${draftId}/submit`).send({});
    expect(early.status).toBe(400);
    expect(early.body.error.fields.price).toBeDefined();
    await owner.patch(`/portal/listings/${draftId}`).send({
      price: 9_800_000,
      beds: 3,
      baths: 3,
      builtUpSqft: 1900,
      landCents: 5,
      description: "Bright family home five minutes from Edappally metro, with a sit-out and a small garden.",
      images: [photoUrl],
      rera: { status: "not_required" },
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    const ok = await owner.post(`/portal/listings/${draftId}/submit`).send({});
    expect(ok.body.status).toBe("pending");
    expect((await request(app).get(`/listings/${draftId}`)).status).toBe(404);
  });

  it("keeps other people out", async () => {
    expect((await buyer.get("/portal/listings")).status).toBe(403);
    expect((await agent.get(`/portal/listings/${draftId}`)).status).toBe(404);
    expect((await agent.patch(`/portal/listings/${draftId}`).send({ price: 1 })).status).toBe(404);
  });

  it("goes live after admin approval, without exposing private fields", async () => {
    const pending = await admin.get("/admin/listings");
    expect(pending.body.items.map((l: { id: string }) => l.id)).toContain(draftId);
    expect((await owner.post(`/admin/listings/${draftId}/review`).send({ decision: "approve" })).status).toBe(403);
    expect((await admin.post(`/admin/listings/${draftId}/review`).send({ decision: "approve" })).body.status).toBe("published");
    const pub = await request(app).get(`/listings/${draftId}`);
    expect(pub.status).toBe(200);
    expect(pub.body).not.toHaveProperty("documentIds");
    expect(pub.body).not.toHaveProperty("ownerId");
  });

  it("applies price edits live but sends location changes back to review", async () => {
    const price = await owner.patch(`/portal/listings/${draftId}`).send({ price: 9_500_000 });
    expect(price.body.status).toBe("published");
    expect(price.body.reReview).toBe(false);
    const moved = await owner.patch(`/portal/listings/${draftId}`).send({ locality: "Palarivattom" });
    expect(moved.body.status).toBe("pending");
    expect(moved.body.reReview).toBe(true);
    await admin.post(`/admin/listings/${draftId}/review`).send({ decision: "approve" });
  });

  it("only allows availability changes that match the purpose", async () => {
    expect((await owner.post(`/portal/listings/${draftId}/status`).send({ status: "rented" })).status).toBe(400);
    expect((await owner.post(`/portal/listings/${draftId}/status`).send({ status: "unavailable" })).body.status).toBe("unavailable");
    expect((await owner.post(`/portal/listings/${draftId}/status`).send({ status: "published" })).body.status).toBe("published");
  });

  it("lets only agents list new projects", async () => {
    const res = await owner.post("/portal/listings").send({ title: "Tower Phase 2", purpose: "buy", type: "apartment", isNewProject: true });
    expect(res.status).toBe(403);
    const ok = await agent.post("/portal/listings").send({ title: "Tower Phase 2", purpose: "buy", type: "apartment", isNewProject: true });
    expect(ok.status).toBe(201);
  });
});

describe("review fixes", () => {
  it("lets owners clear optional fields", async () => {
    const res = await owner.patch(`/portal/listings/${draftId}`).send({ videoUrl: null, description: "A bright family home near the metro, recently repainted, with a sit-out." });
    expect(res.body).not.toHaveProperty("videoUrl");
    expect(res.body.status).toBe("published"); // clearing a live-editable field stays live
  });

  it("sends photo changes on a live listing back to review", async () => {
    const res = await owner.patch(`/portal/listings/${draftId}`).send({ images: [photoUrl, "/img/villa-1.jpg"] });
    expect(res.body.status).toBe("pending");
    expect(res.body.reReview).toBe(true);
    await admin.post(`/admin/listings/${draftId}/review`).send({ decision: "approve" });
  });

  it("caps storage per account and rejects oversized photos", async () => {
    process.env.UPLOAD_MAX_FILES = "1";
    try {
      const fresh = await signIn("agent@example.com");
      expect((await upload(fresh, "/media", PNG, "image/png")).status).toBe(201);
      const over = await upload(fresh, "/media", PNG, "image/png");
      expect(over.status).toBe(413);
      expect(over.body.error.code).toBe("quota_exceeded");
    } finally {
      delete process.env.UPLOAD_MAX_FILES;
    }
    const big = Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)]);
    const tooBig = await upload(owner, "/media", big, "image/png");
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe("too_large");
  });

  it("answers 404 for a damaged file instead of crashing", async () => {
    const up = await upload(owner, "/media", PNG, "image/png");
    await mongoose.connection.db!.collection("media.chunks").deleteMany({ files_id: new mongoose.Types.ObjectId(up.body.id) });
    const res = await request(app).get(`/media/${up.body.id}`);
    expect([404, 200]).toContain(res.status); // headers may already be out for a partial file
    expect((await request(app).get("/health")).status).toBe(200);
  });

  it("does not count views for made-up or hidden listings", async () => {
    await request(app).post("/listings/L999/view").send({});
    await request(app).post("/listings/not-an-id/view").send({});
    expect(await ListingView.countDocuments({ listingId: { $in: ["L999", "not-an-id"] } })).toBe(0);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await owner.patch(`/portal/listings/${draftId}`).set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
  });
});

describe("document vault", () => {
  let docId = "";
  it("stores a fingerprinted private document", async () => {
    const res = await upload(owner, "/documents", PDF, "application/pdf", { "X-Doc-Kind": "title_deed", "X-Listing-Id": draftId, "X-File-Name": "deed.pdf" });
    expect(res.status).toBe(201);
    expect(res.body.sha256).toMatch(/^[a-f0-9]{64}$/);
    docId = res.body.id;
    const list = await owner.get("/documents");
    expect(list.body.items[0]).toMatchObject({ id: docId, kind: "title_deed", listingId: draftId, review: "pending" });
  });

  it("is readable by the owner and admins only, and every read is audited", async () => {
    expect((await owner.get(`/documents/${docId}`)).status).toBe(200);
    expect((await agent.get(`/documents/${docId}`)).status).toBe(404);
    expect((await request(app).get(`/documents/${docId}`)).status).toBe(401);
    expect((await admin.get(`/documents/${docId}`)).status).toBe(200);
    const auditRes = await admin.get("/admin/audit");
    expect(auditRes.body.items.filter((a: { action: string }) => a.action === "document.view").length).toBeGreaterThanOrEqual(2);
  });

  it("buyers may upload ID proof only, not property documents", async () => {
    expect((await upload(buyer, "/documents", PDF, "application/pdf", { "X-Doc-Kind": "title_deed" })).status).toBe(403);
    expect((await upload(buyer, "/documents", PDF, "application/pdf", { "X-Doc-Kind": "id_proof" })).status).toBe(201);
  });
});

describe("enquiries, visits and performance", () => {
  it("shares buyer contact only after the owner confirms a visit", async () => {
    const slot = new Date(Date.now() + 3 * 86_400_000);
    slot.setUTCHours(6, 0, 0, 0); // 11:30 IST
    expect((await buyer.post("/me/visits").send({ listingId: draftId, mode: "in_person", slot: slot.toISOString(), timeZone: "Asia/Kolkata" })).status).toBe(201);
    const list = await owner.get("/portal/visits");
    const v = list.body.items.find((x: { listingId: string }) => x.listingId === draftId);
    expect(v.buyer.name).toBe("Meera Buyer");
    expect(v.buyer.email).toBeNull();
    expect((await owner.post(`/portal/visits/${v.id}`).send({ action: "complete" })).status).toBe(409);
    expect((await owner.post(`/portal/visits/${v.id}`).send({ action: "confirm" })).body.status).toBe("confirmed");
    const after = (await owner.get("/portal/visits")).body.items.find((x: { id: string }) => x.id === v.id);
    expect(after.buyer.email).toBe("buyer@example.com");
    const mine = (await buyer.get("/me/visits")).body.items.find((x: { listingId: string }) => x.listingId === draftId);
    expect(mine.status).toBe("confirmed");
  });

  it("counts unique daily views and shows interested buyers", async () => {
    const visitor = request.agent(app);
    await visitor.post(`/listings/${draftId}/view`).send({});
    await visitor.post(`/listings/${draftId}/view`).send({});
    await buyer.post(`/listings/${draftId}/view`).send({});
    await buyer.put(`/me/saved/${draftId}`).send({});
    await request(app).post("/leads").send({ name: "Ravi", phone: "+91 98470 00000", listingIds: [draftId], consent: true });
    const stats = await owner.get(`/portal/listings/${draftId}/stats`);
    expect(stats.body.views.at(-1).n).toBe(2);
    expect(stats.body.saves).toBe(1);
    expect(stats.body.interested.map((i: { name: string }) => i.name)).toEqual(expect.arrayContaining(["Meera Buyer", "Ravi"]));
    const leads = await owner.get("/portal/leads");
    const lead = leads.body.items.find((l: { name: string }) => l.name === "Ravi");
    expect((await owner.post(`/portal/leads/${lead._id}`).send({ status: "contacted" })).body.status).toBe("contacted");
    const summary = (await owner.get("/portal/listings")).body.items.find((l: { id: string }) => l.id === draftId);
    expect(summary.stats).toMatchObject({ views30d: 2, saves: 1, visits: 1, leads: 1 });
  });

  it("deletes drafts outright but keeps history for listings with visits", async () => {
    const d = await owner.post("/portal/listings").send({ title: "Scratch draft", purpose: "rent", type: "apartment" });
    await owner.delete(`/portal/listings/${d.body.id}`).send({});
    expect((await owner.get(`/portal/listings/${d.body.id}`)).status).toBe(404);
    await owner.delete(`/portal/listings/${draftId}`).send({});
    expect((await request(app).get(`/listings/${draftId}`)).status).toBe(404);
    expect((await buyer.get("/me/visits")).body.items.some((x: { listingId: string }) => x.listingId === draftId)).toBe(true);
  });
});
