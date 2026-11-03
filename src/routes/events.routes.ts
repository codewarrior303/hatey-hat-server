import { Router } from "express";
import type { Filter } from "mongodb";
import { getDb } from "../db/client.js";
import { verifyJwt } from "../middleware/verifyJwt.js";
import { validateBody } from "../middleware/validate.js";
import { writeLimiter } from "../middleware/rateLimiter.js";
import { ApiError } from "../utils/ApiError.js";
import { escapeRegex, toObjectId } from "../utils/helpers.js";
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
router.get("/", async (req, res) => {
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

  res.json({ success: true, count: data.length, data });
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
  res.json({ success: true, data: { ...event, participants } });
});

/** POST /api/events – create. Creator identity comes from the verified JWT only. */
router.post("/", writeLimiter, verifyJwt, validateBody(createEventSchema), async (req, res) => {
  const user = req.user!;
  const body = req.body as CreateEventInput;
  const now = new Date();
  const doc: EventDoc = {
    ...body,
    creatorEmail: user.email,
    creatorName: user.name,
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await events()).insertOne(doc);
  res.status(201).json({ success: true, message: "Event created successfully", data: { ...doc, _id: result.insertedId } });
});

/** Loads an event and enforces ownership (404 if missing, 403 if not the creator). */
async function findOwnedEvent(id: unknown, email: string) {
  const _id = toObjectId(id, "event id");
  const event = await (await events()).findOne({ _id });
  if (!event) throw ApiError.notFound("Event not found");
  if (event.creatorEmail !== email) throw ApiError.forbidden("Only the creator of this event can modify it");
  return event;
}

/** PATCH /api/events/:id – owner only. */
router.patch("/:id", writeLimiter, verifyJwt, validateBody(updateEventSchema), async (req, res) => {
  const event = await findOwnedEvent(req.params.id, req.user!.email);
  const body = req.body as UpdateEventInput;

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

  res.json({ success: true, message: "Event updated successfully", data: updated });
});

/** DELETE /api/events/:id – owner only. Also removes related joins. */
router.delete("/:id", writeLimiter, verifyJwt, async (req, res) => {
  const event = await findOwnedEvent(req.params.id, req.user!.email);
  await (await events()).deleteOne({ _id: event._id });
  const removedJoins = await (await joins()).deleteMany({ eventId: event._id });
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
  if (!event) throw ApiError.notFound("Event not found");
  if (event.eventDate.getTime() <= Date.now()) throw ApiError.badRequest("This event has already taken place");

  const collection = await joins();
  const existing = await collection.findOne({ eventId: _id, userEmail: user.email });
  if (existing) throw ApiError.conflict("You have already joined this event. See you there!");

  const doc: JoinDoc = {
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
    const result = await collection.insertOne(doc);
    res.status(201).json({ success: true, message: "You have joined this event", data: { ...doc, _id: result.insertedId } });
  } catch (error) {
    // Race condition: unique index (eventId + userEmail) caught a parallel duplicate.
    if ((error as { code?: number }).code === 11000) {
      throw ApiError.conflict("You have already joined this event. See you there!");
    }
    throw error;
  }
});

export default router;
