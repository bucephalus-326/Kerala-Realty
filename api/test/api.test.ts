import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { DEMO_PASSWORD, seedIfEmpty } from "../src/scripts/seed-data.js";

const app = createApp();

/** A signed-in agent that keeps its session cookie between requests. */
async function signIn(email: string, password = DEMO_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

/** A visit slot N days ahead at the given IST hour (IST = UTC+5:30). */
function slotIST(daysAhead: number, hourIST: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hourIST - 5, 30 - 30, 0, 0); // hour - 5h30m, written as (hour-5):00 then -30 min below
  d.setUTCMinutes(d.getUTCMinutes() - 30);
  return d.toISOString();
}

beforeAll(async () => {
  await connectDb();
  await seedIfEmpty();
});
afterAll(disconnectDb);

describe("health and listings", () => {
  it("is healthy", async () => {
    expect((await request(app).get("/health")).body).toEqual({ ok: true });
  });

  it("lets guests browse with filters", async () => {
    const res = await request(app).get("/listings").query({ purpose: "rent", limit: 100 });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.items.every((l: { purpose: string }) => l.purpose === "rent")).toBe(true);
    expect(res.body.items[0]).toHaveProperty("coords");
    expect(res.body.items[0]).not.toHaveProperty("ownerId");
  });

  it("returns 404 for unknown listings", async () => {
    expect((await request(app).get("/listings/NOPE")).status).toBe(404);
  });
});

describe("auth", () => {
  it("registers, keeps a session, and never returns the password hash", async () => {
    const agent = request.agent(app);
    const res = await agent
      .post("/auth/register")
      .send({ name: "Test Buyer", email: "t1@example.com", password: "long-enough-1", role: "buyer", saved: ["L001"] });
    expect(res.status).toBe(201);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/kr_session=.*HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    expect(res.body.user.saved).toEqual(["L001"]);
    const me = await agent.get("/auth/me");
    expect(me.body.user.email).toBe("t1@example.com");
    expect(me.body.permissions).toContain("saved:manage");
    expect(me.body.permissions).not.toContain("users:manage");
  });

  it("rejects duplicate emails, weak passwords and self-made admins", async () => {
    const dup = await request(app).post("/auth/register").send({ name: "Copy Cat", email: "buyer@example.com", password: "long-enough-1" });
    expect(dup.status).toBe(409);
    const weak = await request(app).post("/auth/register").send({ name: "Weak", email: "w@example.com", password: "123" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.fields.password).toBeDefined();
    const admin = await request(app).post("/auth/register").send({ name: "Sneaky", email: "s@example.com", password: "long-enough-1", role: "admin" });
    expect(admin.status).toBe(400);
  });

  it("puts new owners and agents in pending verification", async () => {
    const res = await request(app).post("/auth/register").send({ name: "New Owner", email: "o2@example.com", password: "long-enough-1", role: "owner" });
    expect(res.body.user.verification).toBe("pending");
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const a = await request(app).post("/auth/login").send({ email: "buyer@example.com", password: "wrong-password" });
    const b = await request(app).post("/auth/login").send({ email: "nobody@example.com", password: "wrong-password" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it("merges saved-while-signed-out homes at login, and logs out", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/auth/login").send({ email: "buyer@example.com", password: DEMO_PASSWORD, saved: ["L002", "L003"] });
    expect(res.body.user.saved).toEqual(expect.arrayContaining(["L002", "L003"]));
    await agent.post("/auth/logout").send({});
    expect((await agent.get("/auth/me")).status).toBe(401);
  });

  it("ignores a forged session cookie", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", "kr_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwicm9sZSI6ImFkbWluIn0.bad");
    expect(res.status).toBe(401);
  });
});

describe("role-based access", () => {
  it("guests get 401, wrong roles get 403", async () => {
    expect((await request(app).put("/me/saved/L001").send({})).status).toBe(401);
    const owner = await signIn("owner@example.com");
    expect((await owner.put("/me/saved/L001").send({})).status).toBe(403);
    expect((await owner.get("/nri/dashboard")).status).toBe(403);
    const buyer = await signIn("buyer@example.com");
    expect((await buyer.get("/admin/users")).status).toBe(403);
    expect((await buyer.get("/nri/dashboard")).status).toBe(403);
  });

  it("owners see only their own listings", async () => {
    const owner = await signIn("owner@example.com");
    const res = await owner.get("/me/listings");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((l: { postedBy: { kind: string } }) => l.postedBy.kind === "owner")).toBe(true);
    const buyer = await signIn("buyer@example.com");
    expect((await buyer.get("/me/listings")).status).toBe(403);
  });

  it("admins can list users and read the audit trail", async () => {
    const admin = await signIn("admin@example.com");
    const users = await admin.get("/admin/users");
    expect(users.status).toBe(200);
    expect(users.body.items.length).toBeGreaterThanOrEqual(5);
    const auditRes = await admin.get("/admin/audit");
    const actions = auditRes.body.items.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["auth.login", "auth.login_failed", "auth.register"]));
  });

  it("rejects non-JSON writes (CSRF guard)", async () => {
    const buyer = await signIn("buyer@example.com");
    const res = await buyer.put("/me/saved/L001").set("Content-Type", "text/plain").send("x");
    expect(res.status).toBe(415);
    // A bodiless cross-site form post (e.g. to log someone out) is refused too.
    const form = await buyer.post("/auth/logout").set("Content-Type", "application/x-www-form-urlencoded").send("");
    expect(form.status).toBe(415);
    expect((await buyer.get("/auth/me")).status).toBe(200);
  });
});

describe("saved homes and visits", () => {
  it("saves and unsaves", async () => {
    const buyer = await signIn("buyer@example.com");
    expect((await buyer.put("/me/saved/L010").send({})).body.ids).toContain("L010");
    expect((await buyer.put("/me/saved/NOPE").send({})).status).toBe(404);
    const list = await buyer.get("/me/saved");
    expect(list.body.items.map((l: { id: string }) => l.id)).toContain("L010");
    expect((await buyer.delete("/me/saved/L010").send({})).body.ids).not.toContain("L010");
  });

  it("validates visit times and books a video tour", async () => {
    const nri = await signIn("nri@example.com");
    const base = { listingId: "L001", mode: "video", timeZone: "Asia/Dubai" };
    const early = await nri.post("/me/visits").send({ ...base, slot: slotIST(3, 7) });
    expect(early.body.error.code).toBe("outside_hours");
    const soon = await nri.post("/me/visits").send({ ...base, slot: new Date(Date.now() + 30 * 60_000).toISOString() });
    expect(soon.body.error.code).toBe("slot_too_soon");

    const ok = await nri.post("/me/visits").send({ ...base, slot: slotIST(3, 11), note: "Evening call please" });
    expect(ok.status).toBe(201);
    expect(ok.body.ist).toMatch(/11:00/);
    expect(ok.body.local).toMatch(/09:30/); // Dubai is IST − 1:30
    expect(ok.body.listing.title).toBeTruthy();

    const dup = await nri.post("/me/visits").send({ ...base, slot: slotIST(4, 12) });
    expect(dup.status).toBe(409);

    const cancelled = await nri.post(`/me/visits/${ok.body.id}/cancel`).send({});
    expect(cancelled.body.status).toBe("cancelled");
  });
});

describe("NRI concierge and consent", () => {
  it("shows the NRI dashboard and accepts concierge requests", async () => {
    const nri = await signIn("nri@example.com");
    await nri.put("/me/saved/L007").send({});
    await nri.post("/me/visits").send({ listingId: "L007", mode: "video", timeZone: "Asia/Dubai", slot: slotIST(5, 15) });
    const req = await nri.post("/nri/requests").send({ service: "legal", message: "Need a title check for L007" });
    expect(req.status).toBe(201);
    const dash = await nri.get("/nri/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.body.user.preferences.currency).toBe("AED");
    expect(dash.body.shortlist.map((l: { id: string }) => l.id)).toContain("L007");
    expect(dash.body.visits.length).toBeGreaterThan(0);
    expect(dash.body.requests[0].service).toBe("legal");
  });

  it("records consent with an anonymous id", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/consent").send({ personalisation: true, location: false, analytics: false });
    expect(res.status).toBe(201);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/kr_anon=/);
    const latest = await agent.get("/consent");
    expect(latest.body.choices).toEqual({ personalisation: true, location: false, analytics: false });
  });

  it("updates time zone and currency, rejecting unknown zones", async () => {
    const nri = await signIn("nri@example.com");
    expect((await nri.patch("/me").send({ timeZone: "Mars/Olympus" })).status).toBe(400);
    const ok = await nri.patch("/me").send({ timeZone: "Asia/Qatar", currency: "QAR" });
    expect(ok.body.user.preferences).toMatchObject({ timeZone: "Asia/Qatar", currency: "QAR" });
  });
});
