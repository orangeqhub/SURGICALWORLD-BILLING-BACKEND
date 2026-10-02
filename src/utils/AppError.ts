/**
 * Application error taxonomy. Centralised so every failure leaves the API as a
 * predictable shape and internal details (Sequelize messages, SQL, stack
 * traces) are never leaked to a client.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'BRANCH_ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_STATE'
  | 'CUT_OFF_PRICE_VIOLATION'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, new.target);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required.'): AppError {
    return new AppError(401, 'AUTHENTICATION_ERROR', message);
  }

  /** 403 - authenticated but not permitted (role/permission gate). */
  static forbidden(message = 'You do not have permission to perform this action.'): AppError {
    return new AppError(403, 'AUTHORIZATION_ERROR', message);
  }

  /** 403 - authenticated, in-scope role, but targeting another branch. */
  static branchForbidden(message = 'You do not have access to this branch.'): AppError {
    return new AppError(403, 'BRANCH_ACCESS_DENIED', message);
  }

  static notFound(message = 'Resource not found.'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static insufficientStock(message: string, details?: unknown): AppError {
    return new AppError(409, 'INSUFFICIENT_STOCK', message, details);
  }

  static invalidState(message: string, details?: unknown): AppError {
    return new AppError(409, 'INVALID_STATE', message, details);
  }

  static cutOffViolation(message: string, details?: unknown): AppError {
    return new AppError(400, 'CUT_OFF_PRICE_VIOLATION', message, details);
  }

  static internal(message = 'An unexpected error occurred.'): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}

export default AppError;