export type FieldError = { field: string; message: string };

/** Error carrying an HTTP status. Thrown anywhere and formatted by the central error handler. */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors?: FieldError[],
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message = "Bad request", errors?: FieldError[]) {
    return new ApiError(400, message, errors);
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message);
  }
  static forbidden(message = "You do not have permission to perform this action") {
    return new ApiError(403, message);
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, message);
  }
  static conflict(message = "Conflict") {
    return new ApiError(409, message);
  }
}
