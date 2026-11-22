import { Schema, model, type InferSchemaType } from "mongoose";
import { ROLES } from "../auth/rbac.js";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: "buyer" },
    phone: { type: String, trim: true },
    /** Owners and agents need profile verification before their listings go live. */
    verification: { type: String, enum: ["not_required", "pending", "verified", "rejected"], default: "not_required" },
    company: { type: String, trim: true },
    preferences: {
      currency: { type: String, enum: ["INR", "AED", "USD", "QAR"], default: "INR" },
      timeZone: { type: String, default: "Asia/Kolkata" },
      country: { type: String },
    },
    saved: { type: [String], default: [] },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: import("mongoose").Types.ObjectId };
export const User = model("User", userSchema);

/** Safe public shape: never includes the password hash. */
export function publicUser(u: UserDoc) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone ?? null,
    verification: u.verification,
    company: u.company ?? null,
    preferences: u.preferences,
    saved: u.saved,
  };
}
