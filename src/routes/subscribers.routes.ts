import { Router } from "express";
import { getDb } from "../db/client.js";
import { verifyJwt } from "../middleware/verifyJwt.js";

const router = Router();

/**
 * GET /api/subscribers/status
 * Check if the currently authenticated user is subscribed to the newsletter.
 */
router.get("/status", verifyJwt, async (req, res, next) => {
  try {
    const userEmail = req.user!.email.toLowerCase();
    const db = await getDb();
    const collection = db.collection("subscribers");

    const existing = await collection.findOne({ email: userEmail });
    return res.status(200).json({
      success: true,
      isSubscribed: Boolean(existing),
      email: userEmail,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscribers
 * Subscribe the currently authenticated user to the community newsletter.
 * Enforces authentication: only logged-in users can subscribe.
 */
router.post("/", verifyJwt, async (req, res, next) => {
  try {
    const userEmail = req.user!.email.toLowerCase();
    const db = await getDb();
    const collection = db.collection("subscribers");

    const existing = await collection.findOne({ email: userEmail });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: "You are already subscribed to community updates!",
        data: { email: userEmail, isSubscribed: true },
      });
    }

    const result = await collection.insertOne({
      email: userEmail,
      userId: req.user!.id,
      userName: req.user!.name,
      subscribedAt: new Date(),
      ip: req.ip || null,
      userAgent: (req.headers["user-agent"] as string) || null,
    });

    return res.status(201).json({
      success: true,
      message: "Thank you for subscribing to community updates!",
      data: { id: result.insertedId.toString(), email: userEmail, isSubscribed: true },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscribers/unsubscribe
 * Unsubscribe the authenticated user from the community newsletter.
 */
router.post("/unsubscribe", verifyJwt, async (req, res, next) => {
  try {
    const userEmail = req.user!.email.toLowerCase();
    const db = await getDb();
    const collection = db.collection("subscribers");

    await collection.deleteOne({ email: userEmail });

    return res.status(200).json({
      success: true,
      message: "You have been unsubscribed from community updates.",
      data: { email: userEmail, isSubscribed: false },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/subscribers
 * Also allows DELETE for RESTful unsubscribing.
 */
router.delete("/", verifyJwt, async (req, res, next) => {
  try {
    const userEmail = req.user!.email.toLowerCase();
    const db = await getDb();
    const collection = db.collection("subscribers");

    await collection.deleteOne({ email: userEmail });

    return res.status(200).json({
      success: true,
      message: "You have been unsubscribed from community updates.",
      data: { email: userEmail, isSubscribed: false },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
