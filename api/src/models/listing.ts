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
    status: { type: String, enum: ["draft", "pending", "rejected", "published", "sold", "rented", "unavailable", "removed"], default: "published", index: true },
    description: { type: String, maxlength: 2000 },
    /** YouTube or Vimeo link (videos are linked, not stored, to stay within free storage). */
    videoUrl: String,
    /** Possession date for new projects, e.g. "Dec 2028". */
    possession: String,
    /** Private vault documents attached to this listing (GridFS ids). */
    documentIds: { type: [String], default: [] },
    /** False until the owner places the map pin (new drafts start with a placeholder point). */
    pinned: { type: Boolean, default: true },
    reviewNote: String,
    /** Shown first on the home page; set by admins. */
    featured: { type: Boolean, default: false, index: true },
    submittedAt: Date,
    publishedAt: Date,
    nearby: Schema.Types.Mixed,
    counts: Schema.Types.Mixed,
    highlights: Schema.Types.Mixed,
    flood: Schema.Types.Mixed,
    postedAt: String,
    /** 768-d Gemini embedding of the listing text, for semantic ranking. Never sent to clients. */
    embedding: { type: [Number], default: undefined, select: false },
  },
  { timestamps: true },
);
listingSchema.index({ location: "2dsphere" });

export const Listing = model("Listing", listingSchema);

/** Atomic counters (listing ids). */
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = model("Counter", counterSchema);

export async function nextListingId() {
  // Start after the highest seeded id the first time.
  if (!(await Counter.exists({ _id: "listing" }))) {
    const ids = (await Listing.find({}, { _id: 1 }).lean()).map((l) => Number(String(l._id).slice(1)) || 0);
    await Counter.updateOne({ _id: "listing" }, { $setOnInsert: { seq: Math.max(0, ...ids) } }, { upsert: true });
  }
  const c = await Counter.findOneAndUpdate({ _id: "listing" }, { $inc: { seq: 1 } }, { new: true });
  return `L${String(c!.seq).padStart(3, "0")}`;
}

/** One row per listing, day and visitor: deduplicated page views. */
const viewSchema = new Schema({
  listingId: { type: String, index: true },
  day: String,
  visitor: String,
  // Stats read at most 30 days back; rows expire after 90 so the collection stays small.
  createdAt: { type: Date, default: Date.now, expires: 90 * 86_400 },
});
viewSchema.index({ listingId: 1, day: 1, visitor: 1 }, { unique: true });
export const ListingView = model("ListingView", viewSchema);
