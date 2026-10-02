import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken, type JwtPayload } from '../services/tokenService';
import { User } from '../models';

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

/**
 * Verifies the bearer token, then reloads the user row.
 *
 * Reloading (rather than trusting the JWT body alone) means a deactivated or
 * deleted account stops working immediately instead of at token expiry, and
 * role/branch changes take effect on the next request.
 */
export const authenticate: RequestHandler = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    throw AppError.unauthorized('Missing bearer token.');
  }

  let payload: JwtPayload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    const expired = (error as Error).name === 'TokenExpiredError';
    throw AppError.unauthorized(expired ? 'Access token has expired.' : 'Invalid access token.');
  }

  const user = await User.findByPk(payload.sub);
  if (!user) {
    throw AppError.unauthorized('Account no longer exists.');
  }
  if (user.status !== 'active') {
    throw AppError.forbidden('Account is inactive.');
  }

  req.user = {
    id: user.id,
    loginId: user.loginId,
    role: user.role,
    branchId: user.branchId,
    name: user.name,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
  next();
});

/** Narrowing helper so controllers never deal with `req.user` being optional. */
export function currentUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export default authenticate;