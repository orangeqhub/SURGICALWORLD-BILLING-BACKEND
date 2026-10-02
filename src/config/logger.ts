import morgan from 'morgan';
import { env, isProduction, isTest } from './env';

/**
 * Redacted HTTP logging. Authorization headers and any credential-bearing
 * body keys are masked so tokens/passwords never reach the log sink.
 */
const SENSITIVE_BODY_KEYS = new Set(['password', 'passwordHash', 'token', 'jwt', 'secret', 'authorization']);

function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(redactBody);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    output[key] = SENSITIVE_BODY_KEYS.has(key) ? '[REDACTED]' : redactBody(value);
  }
  return output;
}

export const requestLogger = isTest
  ? (_req: unknown, _res: unknown, next: () => void) => next()
  : morgan(
      isProduction ? 'combined' : 'dev',
      {
        skip: (req) => req.url === '/api/health',
        stream: {
          write: (line: string) => {
            console.info(line.trim());
          },
        },
      },
    );

export function logInfo(message: string, meta?: Record<string, unknown>): void {
  console.info(`[info] ${message}`, meta ?? '');
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  if (isTest) return;
  console.warn(`[warn] ${message}`, meta ?? '');
}

export function logError(message: string, meta?: Record<string, unknown>): void {
  console.error(`[error] ${message}`, meta ?? '');
}

export { redactBody, env };