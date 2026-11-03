import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/env.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

/** Central error handler: every error leaves the API as `{ success: false, message, errors? }`. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors?.length ? { errors: err.errors } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.issues.map((issue) => ({ field: issue.path.join(".") || "body", message: issue.message })),
    });
    return;
  }

  // Malformed JSON body from express.json()
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ success: false, message: "Request body is not valid JSON" });
    return;
  }

  // MongoDB duplicate key
  if (err?.code === 11000) {
    res.status(409).json({ success: false, message: "Duplicate record" });
    return;
  }

  console.error("[unhandled error]", err);
  res.status(500).json({
    success: false,
    message: env.isProduction ? "Something went wrong on our side. Please try again." : String(err?.message ?? err),
  });
};
