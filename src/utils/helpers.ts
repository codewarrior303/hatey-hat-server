import { ObjectId } from "mongodb";
import { ApiError } from "./ApiError.js";

/** Parses a route param into an ObjectId or throws a 400. */
export function toObjectId(value: unknown, label = "id"): ObjectId {
  if (typeof value !== "string" || !ObjectId.isValid(value) || new ObjectId(value).toHexString() !== value.toLowerCase()) {
    throw ApiError.badRequest(`Invalid ${label}`, [{ field: label, message: "Must be a valid 24-character ObjectId" }]);
  }
  return new ObjectId(value);
}

/** Escapes user input before embedding it in a RegExp. */
export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
