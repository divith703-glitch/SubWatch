/**
 * Loads `.env` (if present) before any other module reads process.env.
 * Imported first everywhere configuration is needed.
 */
try {
  (process as NodeJS.Process & { loadEnvFile?: () => void }).loadEnvFile?.();
} catch {
  /* no .env file — fall back to real environment variables */
}

import crypto from 'node:crypto';

export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const IS_PROD = NODE_ENV === 'production';

/**
 * Signing secret.
 * - Production: a strong secret is mandatory. The process refuses to start
 *   without one, so a forgotten env var can never silently fall back to a
 *   publicly known string.
 * - Development: if no secret is configured we generate a random one per boot.
 *   Tokens simply stop working when the process restarts, which is exactly what
 *   you want for a throwaway dev secret (and it is never guessable).
 */
function resolveJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();

  if (IS_PROD) {
    if (!configured || configured.length < 32) {
      throw new Error(
        'JWT_SECRET must be set to a random string of at least 32 characters in production.\n' +
          'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"'
      );
    }
    if (/dev-secret|change-me|placeholder|example/i.test(configured)) {
      throw new Error('JWT_SECRET looks like a placeholder value. Refusing to start in production.');
    }
    return configured;
  }

  if (configured && configured.length >= 32) return configured;
  const ephemeral = crypto.randomBytes(48).toString('base64url');
  console.warn('[subwatch] JWT_SECRET not set — using an ephemeral development secret.');
  return ephemeral;
}

export const JWT_SECRET = resolveJwtSecret();

/** Sessions are short-lived; clients silently re-authenticate through /api/auth/me. */
export const TOKEN_TTL = process.env.TOKEN_TTL ?? '12h';

/** Mark the auth cookie Secure whenever we are behind HTTPS (prod, or explicit opt-in). */
export const COOKIE_SECURE = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : IS_PROD;

/**
 * Cross-origin API access (e.g. a separately hosted SPA). The bundled client is
 * served from the same origin, so this stays empty by default: no CORS headers
 * are emitted at all, and browsers block cross-site reads on their own.
 */
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Demo account. Seeded in development only unless explicitly enabled, so a
 * production deployment never ships a publicly known credential.
 */
export const DEMO_ENABLED = process.env.SEED_DEMO
  ? process.env.SEED_DEMO === 'true'
  : !IS_PROD;
export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@subwatch.app';
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234';

/** Simulated provider feed: on in dev, must be opted into elsewhere. */
export const PROVIDER_SYNC_SIMULATED = process.env.PROVIDER_SYNC_SIMULATED
  ? process.env.PROVIDER_SYNC_SIMULATED === 'true'
  : !IS_PROD;

export const TRUST_PROXY = process.env.TRUST_PROXY === 'true' || IS_PROD;
