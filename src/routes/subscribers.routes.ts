import { Router } from "express";
import { getDb } from "../db/client.js";
import { verifyJwt, optionalVerifyJwt } from "../middleware/verifyJwt.js";

const router = Router();

/**
 * GET /api/subscribers/status
 * Check if a user/email is subscribed to the newsletter.
 * Supports authenticated user (Bearer JWT) OR explicit query `?email=...`.
 * Guaranteed to return 200 with `{ isSubscribed: boolean }` and never throw 401 on status checks.
 */
router.get("/status", optionalVerifyJwt, async (req, res, next) => {
  try {
    const rawEmail =
      req.user?.email ||
      (typeof req.query.email === "string" ? req.query.email : "");
    const userEmail = rawEmail.toLowerCase().trim();

    if (!userEmail) {
      return res.status(200).json({
        success: true,
        data: {
          isSubscribed: false,
          email: null,
        },
        isSubscribed: false,
        email: null,
      });
    }

    const db = await getDb();
    const collection = db.collection("subscribers");

    const existing = await collection.findOne({ email: userEmail });
    const isSubscribed = Boolean(existing);
    return res.status(200).json({
      success: true,
      data: {
        isSubscribed,
        email: userEmail,
      },
      isSubscribed,
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
        isSubscribed: true,
        email: userEmail,
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
      isSubscribed: true,
      email: userEmail,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscribers/unsubscribe
 * Unsubscribe the authenticated user (or provided email) from the community newsletter.
 */
router.post("/unsubscribe", optionalVerifyJwt, async (req, res, next) => {
  try {
    const rawEmail =
      req.user?.email ||
      (typeof req.body?.email === "string" ? req.body.email : "");
    const userEmail = rawEmail.toLowerCase().trim();

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: "Email address is required to unsubscribe.",
      });
    }

    const db = await getDb();
    const collection = db.collection("subscribers");

    await collection.deleteOne({ email: userEmail });

    return res.status(200).json({
      success: true,
      message: "You have been unsubscribed from community updates.",
      data: { email: userEmail, isSubscribed: false },
      isSubscribed: false,
      email: userEmail,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/subscribers
 * Also allows DELETE for RESTful unsubscribing.
 */
router.delete("/", optionalVerifyJwt, async (req, res, next) => {
  try {
    const rawEmail =
      req.user?.email ||
      (typeof req.body?.email === "string" ? req.body.email : "");
    const userEmail = rawEmail.toLowerCase().trim();

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: "Email address is required to unsubscribe.",
      });
    }

    const db = await getDb();
    const collection = db.collection("subscribers");

    await collection.deleteOne({ email: userEmail });

    return res.status(200).json({
      success: true,
      message: "You have been unsubscribed from community updates.",
      data: { email: userEmail, isSubscribed: false },
      isSubscribed: false,
      email: userEmail,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
