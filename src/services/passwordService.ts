import { compare, hash } from 'bcryptjs';
import { env } from '../config/env';

/**
 * Password hashing. bcrypt with a configurable cost factor.
 * The plaintext password never leaves this module.
 */
export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, env.BCRYPT_SALT_ROUNDS);
}

/** Constant-time comparison, returning false for any malformed hash. */
export function verifyPassword(plaintext: string, passwordHash: string | null | undefined): Promise<boolean> {
  if (!passwordHash) return Promise.resolve(false);
  return compare(plaintext, passwordHash);
}