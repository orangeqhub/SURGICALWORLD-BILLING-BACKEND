import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../utils/AppError';
import { logError, logWarn } from '../config/logger';
import { env, isProduction } from '../config/env';

/** 404 catch-all mounted after all routers. */
export const notFoundHandler: RequestHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
};

interface ErrorBody {
  [key: string]: unknown;
}

function normalise(err: unknown): { status: number; body: ErrorBody } {
  // 1. Deliberate, already-classified application error.
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    };
  }

  // 2. Body/param/query validation (e.g. an unparsed JSON payload).
  if (err instanceof SyntaxError && 'body' in err) {
    return { status: 400, body: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.' } };
  }

  // 3. Sequelize errors. Internal detail (SQL text, constraint internals) is
  //    summarised, never forwarded verbatim.
  if (isSequelizeError(err)) {
    return mapSequelizeError(err);
  }

  // 4. Anything else is a bug: log it server-side, return an opaque 500.
  return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } };
}

interface SequelizeLikeError extends Error {
  name: string;
  parent?: { code?: string; constraint?: string; detail?: string };
  errors?: Array<{ path?: string; message: string; type?: string }>;
  original?: { code?: string };
}

function isSequelizeError(err: unknown): err is SequelizeLikeError {
  if (!(err instanceof Error)) return false;
  return ['SequelizeValidationError', 'SequelizeUniqueConstraintError', 'SequelizeForeignKeyConstraintError', 'SequelizeDatabaseError', 'SequelizeEmptyResultError', 'SequelizeInsufficientStockError'].includes(err.name);
}

function mapSequelizeError(err: SequelizeLikeError): { status: number; body: ErrorBody } {
  switch (err.name) {
    case 'SequelizeValidationError': {
      const details = (err.errors ?? []).map((issue) => ({ path: issue.path ?? '', message: issue.message }));
      return { status: 400, body: { code: 'VALIDATION_ERROR', message: 'Validation failed.', details } };
    }
    case 'SequelizeUniqueConstraintError': {
      const constraint = err.parent?.constraint ?? '';
      // Names only reveal which field collided - never the submitted value.
      const field = constraint.replace(/^.*_(.)/, '$1');
      return {
        status: 409,
        body: { code: 'CONFLICT', message: `A record with this ${field || 'value'} already exists.` },
      };
    }
    case 'SequelizeForeignKeyConstraintError':
      return { status: 400, body: { code: 'VALIDATION_ERROR', message: 'Referenced record does not exist.' } };
    case 'SequelizeEmptyResultError':
      return { status: 404, body: { code: 'NOT_FOUND', message: 'Resource not found.' } };
    case 'SequelizeDatabaseError': {
      // A CHECK violation on one of our financial columns.
      if (err.parent?.code === '23514') {
        return {
          status: 400,
          body: { code: 'VALIDATION_ERROR', message: 'A value violated a database constraint (range or format).' },
        };
      }
      logError('Unhandled database error', { code: err.parent?.code });
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'A database error occurred.' } };
    }
    default:
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } };
  }
}

/**
 * Centralised error handling. Every failure leaves the API as
 *   { success: false, error: { code, message, details? } }
 * Stack traces are attached only outside production.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const { status, body } = normalise(err);

  if (status >= 500) {
    logError('Unhandled server error', {
      method: req.method,
      path: req.originalUrl,
      name: err instanceof Error ? err.name : 'Unknown',
      message: err instanceof Error ? err.message : String(err),
      stack: isProduction ? undefined : err instanceof Error ? err.stack : undefined,
    });
  } else if (status === 403) {
    logWarn('Forbidden request', { method: req.method, path: req.originalUrl, code: body.code });
  }

  res.status(status).json({
    success: false,
    error: body,
    ...(isProduction ? {} : { stack: err instanceof Error ? err.stack : undefined, env: env.NODE_ENV }),
  });
};

export default errorHandler;