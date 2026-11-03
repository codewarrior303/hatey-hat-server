import type { ObjectId } from "mongodb";
import type { EventType } from "../validators/event.validator.js";

export interface EventDoc {
  _id?: ObjectId;
  title: string;
  description: string;
  eventType: EventType;
  thumbnail: string;
  location: string;
  eventDate: Date;
  creatorEmail: string;
  creatorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JoinDoc {
  _id?: ObjectId;
  eventId: ObjectId;
  eventTitle: string;
  eventDate: Date;
  eventThumbnail: string;
  eventLocation: string;
  eventType: EventType;
  userEmail: string;
  userName: string;
  joinedAt: Date;
}
