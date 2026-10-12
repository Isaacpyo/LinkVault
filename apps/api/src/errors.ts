export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Sign in to continue') => new AppError(401, 'UNAUTHORIZED', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

/** Thrown by stores on a unique-constraint violation (e.g. email already registered). */
export class DuplicateError extends Error {
  constructor(message = 'Already exists') {
    super(message);
    this.name = 'DuplicateError';
  }
}
