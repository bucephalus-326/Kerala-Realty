import { Schema, model } from "mongoose";

/** Visit requests: in person or live video tour. */
const visitSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listingId: { type: String, ref: "Listing", required: true, index: true },
    mode: { type: String, enum: ["in_person", "video"], required: true },
    /** Stored in UTC. */
    slot: { type: Date, required: true },
    /** The buyer's time zone when they booked, for showing both clocks. */
    timeZone: { type: String, required: true },
    note: { type: String, maxlength: 500 },
    status: { type: String, enum: ["requested", "confirmed", "cancelled", "completed"], default: "requested" },
  },
  { timestamps: true },
);
export const Visit = model("Visit", visitSchema);

/** NRI concierge service requests. */
const conciergeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    service: { type: String, enum: ["shortlist", "legal", "visit", "documents", "after_sales", "other"], required: true },
    message: { type: String, required: true, maxlength: 1000 },
    listingIds: [String],
    status: { type: String, enum: ["open", "in_progress", "done"], default: "open" },
  },
  { timestamps: true },
);
export const ConciergeRequest = model("ConciergeRequest", conciergeSchema);

/** DPDP consent records. One row per decision; latest wins. No IP address is stored. */
const consentSchema = new Schema(
  {
    anonId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    version: { type: String, required: true },
    choices: {
      personalisation: { type: Boolean, required: true },
      location: { type: Boolean, required: true },
      analytics: { type: Boolean, required: true },
    },
  },
  { timestamps: true },
);
export const Consent = model("Consent", consentSchema);

/** Append-only audit trail of security-relevant actions. */
const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorRole: String,
    action: { type: String, required: true, index: true },
    target: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const AuditLog = model("AuditLog", auditSchema);
