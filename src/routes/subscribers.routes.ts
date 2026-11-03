import { Router } from "express";
import { getDb } from "../db/client.js";
import { subscriberSchema } from "../validators/subscriber.validator.js";

const router = Router();

router.post("/", async (req, res, next) => {
  try {
    const parsed = subscriberSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid email address";
      return res.status(400).json({
        success: false,
        message: firstError,
        errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      });
    }

    const { email } = parsed.data;
    const db = await getDb();
    const collection = db.collection("subscribers");

    const existing = await collection.findOne({ email });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: "You are already subscribed to community updates!",
        data: { email, alreadySubscribed: true },
      });
    }

    const result = await collection.insertOne({
      email,
      subscribedAt: new Date(),
      ip: req.ip || null,
      userAgent: (req.headers["user-agent"] as string) || null,
    });

    return res.status(201).json({
      success: true,
      message: "Thank you for subscribing to community updates!",
      data: { id: result.insertedId.toString(), email },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
