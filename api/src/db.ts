import mongoose from "mongoose";
import { config } from "./config.js";

let memoryServer: { stop: () => Promise<boolean> } | null = null;

/** Connect to MONGODB_URI, or start an in-memory MongoDB for local development. */
export async function connectDb(uri = config.mongoUri) {
  let target = uri;
  if (!target) {
    if (config.isProd) throw new Error("MONGODB_URI is required in production");
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const server = await MongoMemoryServer.create();
    memoryServer = server;
    target = server.getUri("kerala_realty");
    console.log("Using in-memory MongoDB (data resets on restart)");
  }
  mongoose.set("strictQuery", true);
  await mongoose.connect(target);
  return target;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  await memoryServer?.stop();
  memoryServer = null;
}
