import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { User } from "../src/models/user.js";
import { DEMO_PASSWORD, seedIfEmpty } from "../src/scripts/seed-data.js";

const app = createApp();
const saved = { ...process.env };

beforeAll(async () => {
  await connectDb();
  Object.assign(process.env, { NODE_ENV: "production", SEED_DEMO_USERS: "true", ADMIN_EMAIL: "Boss@Example.org", ADMIN_PASSWORD: "a-long-admin-pass" });
});
afterAll(async () => {
  for (const k of ["NODE_ENV", "SEED_DEMO_USERS", "ADMIN_EMAIL", "ADMIN_PASSWORD"]) process.env[k] = saved[k];
  await disconnectDb();
});

const login = (email: string, password: string) => request(app).post("/auth/login").send({ email, password });

it("in production, never creates the public demo admin and creates the env admin once", async () => {
  await seedIfEmpty();
  await seedIfEmpty(); // a restart must not create a second admin or reset the password

  expect((await login("admin@example.com", DEMO_PASSWORD)).status).toBe(401);
  expect((await login("buyer@example.com", DEMO_PASSWORD)).status).toBe(200);
  const boss = await login("boss@example.org", "a-long-admin-pass");
  expect(boss.status).toBe(200);
  expect(boss.body.user.role).toBe("admin");
  expect(await User.countDocuments({ role: "admin" })).toBe(1);
});
