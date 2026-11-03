import { Router } from "express";
import { getDb } from "../db/client.js";
import { verifyJwt } from "../middleware/verifyJwt.js";
import type { JoinDoc } from "../types/models.js";

const router = Router();

/** GET /api/joins/my – events joined by the logged-in user, soonest first. */
router.get("/my", verifyJwt, async (req, res) => {
  const db = await getDb();
  const data = await db
    .collection<JoinDoc>("joins")
    .find({ userEmail: req.user!.email })
    .sort({ eventDate: 1, joinedAt: 1 })
    .toArray();
  res.json({ success: true, count: data.length, data });
});

export default router;
