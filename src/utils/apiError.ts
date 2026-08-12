export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors?: any;

  constructor(statusCode: number, message: string, errors?: any) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors?: any) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message: string = 'Unauthorized access') {
    return new ApiError(401, message);
  }

  static forbidden(message: string = 'Forbidden access') {
    return new ApiError(403, message);
  }

  static notFound(message: string = 'Resource not found') {
    return new ApiError(404, message);
  }

  static internal(message: string = 'Internal server error') {
    return new ApiError(500, message);
  }
}
