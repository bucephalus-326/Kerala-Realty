import { Schema, model } from "mongoose";

/**
 * Listings keep the generated shape (see scripts/build-data.mjs) and add
 * ownership and moderation fields used by the portal and admin stages.
 */
const listingSchema = new Schema(
  {
    _id: { type: String },
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    purpose: { type: String, enum: ["buy", "rent"], required: true, index: true },
    type: { type: String, enum: ["villa", "house", "apartment", "plot", "commercial"], required: true, index: true },
    price: { type: Number, required: true, index: true },
    beds: Number,
    baths: Number,
    builtUpSqft: Number,
    landCents: Number,
    furnishing: String,
    locality: { type: String, index: true },
    city: { type: String, index: true },
    district: String,
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },
    rera: { status: String, number: String },
    verified: Boolean,
    isNewProject: Boolean,
    isLuxury: Boolean,
    images: [String],
    amenities: [String],
    postedBy: { kind: String, name: String },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    status: { type: String, enum: ["draft", "pending", "published", "sold", "rented", "unavailable"], default: "published", index: true },
    nearby: Schema.Types.Mixed,
    counts: Schema.Types.Mixed,
    highlights: Schema.Types.Mixed,
    flood: Schema.Types.Mixed,
    postedAt: String,
  },
  { timestamps: true },
);
listingSchema.index({ location: "2dsphere" });

export const Listing = model("Listing", listingSchema);
