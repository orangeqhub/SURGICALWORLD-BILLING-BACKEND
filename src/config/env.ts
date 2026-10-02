import 'dotenv/config';

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_NAME_TEST: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_LOGGING: boolean;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  BCRYPT_SALT_ROUNDS: number;
  LOGIN_RATE_LIMIT: number;
  CORS_ORIGIN: string[];
}

function required(name: string, value: string | undefined, fallback?: string): string {
  const resolved = value ?? fallback;
  if (!resolved) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return resolved;
}

function asBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function asList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const NODE_ENV = (process.env.NODE_ENV ?? 'development') as Env['NODE_ENV'];

export const env: Env = {
  NODE_ENV,
  PORT: Number(process.env.PORT ?? 5000),
  DB_HOST: required('DB_HOST', process.env.DB_HOST, 'localhost'),
  DB_PORT: Number(process.env.DB_PORT ?? 5432),
  DB_NAME: required('DB_NAME', process.env.DB_NAME, NODE_ENV === 'test' ? 'surgical_world_test' : 'surgical_world'),
  DB_NAME_TEST: process.env.DB_NAME_TEST ?? 'surgical_world_test',
  DB_USER: required('DB_USER', process.env.DB_USER, 'postgres'),
  DB_PASSWORD: required('DB_PASSWORD', process.env.DB_PASSWORD, ''),
  DB_LOGGING: asBool(process.env.DB_LOGGING, false),
  JWT_SECRET: required('JWT_SECRET', process.env.JWT_SECRET, NODE_ENV === 'production' ? undefined : 'dev-only-insecure-secret-change-me'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
  BCRYPT_SALT_ROUNDS: Number(process.env.BCRYPT_SALT_ROUNDS ?? 10),
  // Failed logins allowed per IP per 15 minutes. Successful logins do not count.
  LOGIN_RATE_LIMIT: Number(process.env.LOGIN_RATE_LIMIT ?? 10),
  CORS_ORIGIN: asList(process.env.CORS_ORIGIN),
};

export const isProduction = NODE_ENV === 'production';
export const isTest = NODE_ENV === 'test';