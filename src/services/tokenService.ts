import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '../constants/roles';

/**
 * JWT payload. Every value here is derived from the database at login time and
 * re-verified against the user row on each request - the client can neither
 * choose nor influence any of it.
 *
 * `branchId` is null for SUPER_ADMIN (that is what makes them global) and
 * non-null for BRANCH_ADMIN/EMPLOYEE, enforced by the
 * users_branch_required_by_role CHECK constraint.
 */
export interface JwtPayload {
  sub: string;
  loginId: string;
  role: Role;
  branchId: string | null;
  name: string;
  iat?: number;
  exp?: number;
}

const ISSUER = 'surgical-world-billing';
const AUDIENCE = 'surgical-world-app';

export function signAccessToken(user: { id: string; loginId: string; role: Role; branchId: string | null; name: string }): string {
  const payload: JwtPayload = {
    sub: user.id,
    loginId: user.loginId,
    role: user.role,
    branchId: user.branchId,
    name: user.name,
  };
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: ISSUER,
    audience: AUDIENCE,
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, audience: AUDIENCE }) as JwtPayload;
}