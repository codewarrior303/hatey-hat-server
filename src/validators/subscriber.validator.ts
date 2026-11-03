import { z } from "zod";

export const subscriberSchema = z.object({
  email: z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address")
    .max(120, "Email address is too long"),
});

export type SubscriberInput = z.infer<typeof subscriberSchema>;
