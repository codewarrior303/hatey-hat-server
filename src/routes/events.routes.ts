import { Router } from "express";
import type { Filter, ObjectId } from "mongodb";
import { getDb } from "../db/client.js";
import { verifyJwt } from "../middleware/verifyJwt.js";
import { validateBody } from "../middleware/validate.js";
import { writeLimiter, searchLimiter, statsLimiter, getClientIp } from "../middleware/rateLimiter.js";
import { ApiError } from "../utils/ApiError.js";
import { escapeRegex, toObjectId } from "../utils/helpers.js";
import { logSecurityAudit } from "../utils/auditLogger.js";
import type { EventDoc, JoinDoc } from "../types/models.js";
import {
  createEventSchema,
  listEventsQuerySchema,
  updateEventSchema,
  type CreateEventInput,
  type UpdateEventInput,
} from "../validators/event.validator.js";

const router = Router();

const events = async () => (await getDb()).collection<EventDoc>("events");
const joins = async () => (await getDb()).collection<JoinDoc>("joins");

/** GET /api/events – upcoming events only. Supports ?search=&type=&limit= */
router.get(
  "/",
  // Apply search rate limiter dynamically if query has search terms
  (req, res, next) => {
    if (req.query.search) {
      return searchLimiter(req, res, next);
    }
    next();
  },
  async (req, res) => {
    const query = listEventsQuerySchema.parse(req.query);

    const filter: Filter<EventDoc> = { eventDate: { $gt: new Date() } };
    if (query.type) filter.eventType = query.type;
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), "i");
      filter.$or = [{ title: pattern }, { location: pattern }];
    }

    let cursor = (await events()).find(filter).sort({ eventDate: 1, _id: 1 });
    if (query.limit) cursor = cursor.limit(query.limit);
    const data = await cursor.toArray();

    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    res.json({ success: true, count: data.length, data });
  },
);

/** GET /api/events/stats/summary – live metrics from real database (honest numbers) */
router.get("/stats/summary", statsLimiter, async (_req, res) => {
  const now = new Date();
  const eventsColl = await events();
  const joinsColl = await joins();

  const [upcomingCount, totalJoins, distinctTypes, distinctLocations] = await Promise.all([
    eventsColl.countDocuments({ eventDate: { $gt: now } }),
    joinsColl.countDocuments({}),
    eventsColl.distinct("eventType"),
    eventsColl.distinct("location"),
  ]);

  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=120");
  res.json({
    success: true,
    data: {
      upcomingEvents: upcomingCount,
      totalJoins,
      categoriesCount: distinctTypes.length,
      locationsCount: distinctLocations.length,
    },
  });
});

/** GET /api/events/my – events created by the logged-in user. Must be declared before /:id. */
router.get("/my", verifyJwt, async (req, res) => {
  const user = req.user!;
  const data = await (await events()).find({ creatorEmail: user.email }).sort({ eventDate: 1 }).toArray();
  res.json({ success: true, count: data.length, data });
});

/** GET /api/events/:id – single event (public). Includes participant count. */
router.get("/:id", async (req, res) => {
  const _id = toObjectId(req.params.id, "event id");
  const event = await (await events()).findOne({ _id });
  if (!event) throw ApiError.notFound("Event not found");
  const participants = await (await joins()).countDocuments({ eventId: _id });
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
  res.json({ success: true, data: { ...event, participants } });
});

/**
 * Ensures that no other event exists with the same category (`eventType`)
 * at the same location on the same day & date/time.
 * Throws 409 Conflict if an overlapping event already exists.
 */
async function checkEventSchedulingConflict(
  eventType: string,
  location: string,
  eventDate: Date,
  excludeEventId?: ObjectId
) {
  const target = new Date(eventDate);
  // Full calendar day boundaries in UTC
  const dayStart = new Date(target);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(target);
  dayEnd.setUTCHours(23, 59, 59, 999);

  // Escaped regex for case-insensitive, whitespace-trimmed location comparison
  const escapedLocation = escapeRegex(location.trim());

  const filter: any = {
    eventType,
    location: { $regex: new RegExp(`^${escapedLocation}$`, "i") },
    $or: [
      { eventDate: { $gte: dayStart, $lte: dayEnd } },
      {
        eventDate: {
          $gte: new Date(target.getTime() - 8 * 3600 * 1000),
          $lte: new Date(target.getTime() + 8 * 3600 * 1000),
        },
      },
    ],
  };

  if (excludeEventId) {
    filter._id = { $ne: excludeEventId };
  }

  const existing = await (await events()).findOne(filter);
  if (existing) {
    const formattedDate = target.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    throw ApiError.conflict(
      `An initiative ("${existing.title}") is already scheduled for "${eventType}" at "${existing.location}" on ${formattedDate}. Only 1 event per category and location is allowed on the same day.`
    );
  }
}

/** POST /api/events – create. Creator identity comes from the verified JWT only. */
router.post("/", writeLimiter, verifyJwt, validateBody(createEventSchema), async (req, res) => {
  const user = req.user!;
  const body = req.body as CreateEventInput;
  const now = new Date();
  const clientIp = getClientIp(req);

  // Enforce conflict protection: prevent multiple events with same category and location on the same day
  await checkEventSchedulingConflict(body.eventType, body.location, body.eventDate);

  const doc: EventDoc = {
    ...body,
    creatorEmail: user.email,
    creatorName: user.name,
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await events()).insertOne(doc);

  await logSecurityAudit({
    action: "event_created",
    ip: clientIp,
    userId: user.id,
    userEmail: user.email,
    path: req.originalUrl,
    method: req.method,
    details: { eventId: result.insertedId.toString(), title: doc.title },
  });

  res.status(201).json({ success: true, message: "Event created successfully", data: { ...doc, _id: result.insertedId } });
});

/** Loads an event and enforces ownership (404 if missing, 403 if not the creator). */
async function findOwnedEvent(id: unknown, email: string, req?: any) {
  const _id = toObjectId(id, "event id");
  const event = await (await events()).findOne({ _id });
  if (!event) throw ApiError.notFound("Event not found");
  if (event.creatorEmail !== email) {
    if (req) {
      await logSecurityAudit({
        action: "forbidden_access_attempt",
        ip: getClientIp(req),
        userId: req.user?.id,
        userEmail: email,
        path: req.originalUrl,
        method: req.method,
        details: { eventId: _id.toString(), eventCreator: event.creatorEmail },
      });
    }
    throw ApiError.forbidden("Only the creator of this event can modify it");
  }
  return event;
}

/** PATCH /api/events/:id – owner only. */
router.patch("/:id", writeLimiter, verifyJwt, validateBody(updateEventSchema), async (req, res) => {
  const event = await findOwnedEvent(req.params.id, req.user!.email, req);
  const body = req.body as UpdateEventInput;
  const clientIp = getClientIp(req);

  // If category, location, or eventDate changed, verify scheduling conflict against other events
  if (body.eventType || body.location || body.eventDate) {
    const checkType = body.eventType || event.eventType;
    const checkLocation = body.location || event.location;
    const checkDate = body.eventDate ? new Date(body.eventDate) : event.eventDate;
    await checkEventSchedulingConflict(checkType, checkLocation, checkDate, event._id);
  }

  const updated = await (await events()).findOneAndUpdate(
    { _id: event._id },
    { $set: { ...body, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  // Keep denormalised event data on join records in sync.
  const joinPatch: Partial<JoinDoc> = {};
  if (body.title) joinPatch.eventTitle = body.title;
  if (body.eventDate) joinPatch.eventDate = body.eventDate;
  if (body.thumbnail) joinPatch.eventThumbnail = body.thumbnail;
  if (body.location) joinPatch.eventLocation = body.location;
  if (body.eventType) joinPatch.eventType = body.eventType;
  if (Object.keys(joinPatch).length) await (await joins()).updateMany({ eventId: event._id }, { $set: joinPatch });

  await logSecurityAudit({
    action: "event_updated",
    ip: clientIp,
    userId: req.user!.id,
    userEmail: req.user!.email,
    path: req.originalUrl,
    method: req.method,
    details: { eventId: event._id.toString(), updatedFields: Object.keys(body) },
  });

  res.json({ success: true, message: "Event updated successfully", data: updated });
});

/** DELETE /api/events/:id – owner only. Also removes related joins. */
router.delete("/:id", writeLimiter, verifyJwt, async (req, res) => {
  const event = await findOwnedEvent(req.params.id, req.user!.email, req);
  const clientIp = getClientIp(req);

  await (await events()).deleteOne({ _id: event._id });
  const removedJoins = await (await joins()).deleteMany({ eventId: event._id });

  await logSecurityAudit({
    action: "event_deleted",
    ip: clientIp,
    userId: req.user!.id,
    userEmail: req.user!.email,
    path: req.originalUrl,
    method: req.method,
    details: { eventId: event._id.toString(), removedJoins: removedJoins.deletedCount },
  });

  res.json({
    success: true,
    message: "Event deleted successfully",
    data: { _id: event._id, removedJoins: removedJoins.deletedCount },
  });
});

/** POST /api/events/:id/join – join an upcoming event. Duplicate joins return 409. */
router.post("/:id/join", writeLimiter, verifyJwt, async (req, res) => {
  const user = req.user!;
  const _id = toObjectId(req.params.id, "event id");
  const event = await (await events()).findOne({ _id });
  const clientIp = getClientIp(req);

  if (!event) throw ApiError.notFound("Event not found");

  if (new Date(event.eventDate).getTime() <= Date.now()) {
    throw ApiError.badRequest("Cannot join an event that has already occurred");
  }

  const existing = await (await joins()).findOne({ eventId: _id, userEmail: user.email });
  if (existing) {
    throw ApiError.conflict("You have already joined this event");
  }

  const joinDoc: JoinDoc = {
    eventId: _id,
    eventTitle: event.title,
    eventDate: event.eventDate,
    eventThumbnail: event.thumbnail,
    eventLocation: event.location,
    eventType: event.eventType,
    userEmail: user.email,
    userName: user.name,
    joinedAt: new Date(),
  };

  try {
    const result = await (await joins()).insertOne(joinDoc);

    await logSecurityAudit({
      action: "event_joined",
      ip: clientIp,
      userId: user.id,
      userEmail: user.email,
      path: req.originalUrl,
      method: req.method,
      details: { eventId: _id.toString(), eventTitle: event.title },
    });

    res.status(201).json({ success: true, message: "Joined event successfully", data: { ...joinDoc, _id: result.insertedId } });
  } catch (error: any) {
    if (error?.code === 11000) throw ApiError.conflict("You have already joined this event");
    throw error;
  }
});

export default router;
