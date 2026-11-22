import { Schema, model } from "mongoose";

/** Visitor reports of suspicious or wrong listings. */
export const REPORT_REASONS = ["fake", "wrong_price", "already_sold", "wrong_location", "duplicate", "scam", "other"] as const;
const reportSchema = new Schema(
  {
    listingId: { type: String, required: true, index: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, maxlength: 1000 },
    reporterId: { type: Schema.Types.ObjectId, ref: "User" },
    reporterKey: { type: String, required: true },
    status: { type: String, enum: ["open", "dismissed", "actioned"], default: "open", index: true },
    resolution: { type: String, maxlength: 500 },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
// One open report per visitor per listing.
reportSchema.index({ listingId: 1, reporterKey: 1 }, { unique: true });
export const Report = model("Report", reportSchema);

/** Platform settings: a single document, editable by admins. */
const settingsSchema = new Schema(
  {
    _id: { type: String, default: "platform" },
    announcement: { text: { type: String, maxlength: 200, default: "" }, active: { type: Boolean, default: false } },
    ai: { dailyPerVisitor: Number, globalDaily: Number, enabled: { type: Boolean, default: true } },
    uploads: { maxFiles: Number, maxMB: Number },
  },
  { timestamps: true },
);
export const Settings = model("Settings", settingsSchema);
