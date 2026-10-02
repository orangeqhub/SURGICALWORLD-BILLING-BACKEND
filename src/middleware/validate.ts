import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError';

/**
 * Zod-backed request validation. Invalid input is rejected with 400 BEFORE the
 * handler runs, so a malformed body can never reach a service - and never reach
 * the database.
 *
 * Validated values REPLACE the raw ones on the request, which means downstream
 * code receives coerced, trusted-shaped data rather than unvalidated input.
 */
export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        // req.query is a getter-only property on Express 5-style routers; assign
        // onto a plain object to keep this compatible across versions.
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    } catch (error) {
      if (error instanceof ZodError) {
        throw AppError.badRequest('Request validation failed.', formatZodError(error));
      }
      throw error;
    }
    next();
  };
}

function formatZodError(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export default validate;