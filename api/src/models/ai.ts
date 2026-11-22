import { Schema, model } from "mongoose";

/** Per-visitor daily count of AI-backed answers (free-tier protection). */
const usageSchema = new Schema({
  key: { type: String, required: true },
  day: { type: String, required: true },
  count: { type: Number, default: 0 },
});
usageSchema.index({ key: 1, day: 1 }, { unique: true });
usageSchema.index({ day: 1 });
export const AiUsage = model("AiUsage", usageSchema);

/** Cached assistant answers for repeated questions (24 h). */
const cacheSchema = new Schema({
  key: { type: String, required: true, unique: true },
  response: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, expires: 86_400 },
});
export const AiCache = model("AiCache", cacheSchema);

/** One row per assistant turn, for monitoring quality, cost and errors. No message text is stored. */
const logSchema = new Schema(
  {
    mode: { type: String, enum: ["rule", "llm", "fallback", "cache"], required: true },
    intent: String,
    provider: String,
    model: String,
    tokens: Number,
    toolCalls: [String],
    latencyMs: Number,
    results: Number,
    error: String,
    limited: Boolean,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
logSchema.index({ createdAt: -1 });
export const AiLog = model("AiLog", logSchema);

/** Callback / enquiry requests from the assistant, listings or NRI pages. */
const leadSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    phone: { type: String, required: true, maxlength: 24 },
    preferredTime: { type: String, maxlength: 60 },
    timeZone: String,
    message: { type: String, maxlength: 500 },
    listingIds: [String],
    filters: Schema.Types.Mixed,
    source: { type: String, enum: ["assistant", "listing", "nri"], default: "assistant" },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    anonId: String,
    status: { type: String, enum: ["new", "contacted", "closed"], default: "new" },
  },
  { timestamps: true },
);
export const Lead = model("Lead", leadSchema);
