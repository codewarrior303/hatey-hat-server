import { z } from "zod";

export const EVENT_TYPES = [
  "Cleanup",
  "Plantation",
  "Donation",
  "Food Distribution",
  "Blood Donation",
  "Education",
  "Health Camp",
  "Other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const futureDate = z.coerce
  .date({ error: "Event date must be a valid date and time" })
  .refine((date) => !Number.isNaN(date.getTime()), "Event date must be a valid date and time")
  .refine((date) => date.getTime() > Date.now(), "Event date and time must be in the future");

const httpUrl = z
  .string({ error: "Thumbnail URL is required" })
  .trim()
  .url("Thumbnail must be a valid URL")
  .refine(
    (value) => /^https?:\/\//i.test(value) && !/^(javascript|data|vbscript|file):/i.test(value),
    "Thumbnail must start with http:// or https://"
  )
  .max(1000, "Thumbnail URL is too long");

export const createEventSchema = z
  .object({
    title: z
      .string({ error: "Title is required" })
      .trim()
      .min(5, "Title must be at least 5 characters")
      .max(120, "Title must be at most 120 characters"),
    description: z
      .string({ error: "Description is required" })
      .trim()
      .min(20, "Description must be at least 20 characters")
      .max(3000, "Description must be at most 3000 characters"),
    eventType: z.enum(EVENT_TYPES, { error: `Event type must be one of: ${EVENT_TYPES.join(", ")}` }),
    thumbnail: httpUrl,
    location: z
      .string({ error: "Location is required" })
      .trim()
      .min(3, "Location must be at least 3 characters")
      .max(160, "Location must be at most 160 characters"),
    eventDate: futureDate,
  })
  .strict();

export const updateEventSchema = createEventSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const listEventsQuerySchema = z
  .object({
    search: z.string().trim().max(100, "Search is too long").optional(),
    type: z
      .union([z.enum(EVENT_TYPES), z.literal(""), z.literal("all")])
      .optional()
      .transform((value) => (value && value !== "all" ? value : undefined)),
    limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(60, "Limit must be at most 60").optional(),
    page: z.coerce.number().int().min(1, "Page must be at least 1").max(1000, "Page must be at most 1000").optional(),
  })
  .strict();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
