import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Forwards rejected promises from async route handlers into Express's error
 * pipeline, so a throw inside a controller reaches the central error handler
 * instead of hanging the request.
 */
export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export default asyncHandler;