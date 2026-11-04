import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { ALLOWED_ORIGINS, COOKIE_SECURE, IS_PROD } from './env.js';

export const AUTH_COOKIE = 'sw_session';
export const CSRF_COOKIE = 'sw_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/* ------------------------------------------------------------------ cookies */

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function cookie(name: string, value: string, opts: { httpOnly: boolean; maxAge?: number }) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `SameSite=Strict`,
    opts.httpOnly ? 'HttpOnly' : '',
    COOKIE_SECURE ? 'Secure' : '',
    opts.maxAge !== undefined ? `Max-Age=${opts.maxAge}` : '',
  ];
  return bits.filter(Boolean).join('; ');
}

/**
 * The session lives in an HttpOnly cookie, so JavaScript (and therefore an XSS
 * payload) cannot read it. A second, readable CSRF cookie provides defence in
 * depth for state-changing requests (double-submit pattern).
 */
export function issueSessionCookies(res: Response, token: string, ttlSeconds: number) {
  const csrf = crypto.randomBytes(24).toString('base64url');
  res.append(
    'Set-Cookie',
    cookie(AUTH_COOKIE, token, { httpOnly: true, maxAge: ttlSeconds })
  );
  res.append('Set-Cookie', cookie(CSRF_COOKIE, csrf, { httpOnly: false, maxAge: ttlSeconds }));
  return csrf;
}

export function clearSessionCookies(res: Response) {
  res.append('Set-Cookie', cookie(AUTH_COOKIE, '', { httpOnly: true, maxAge: 0 }));
  res.append('Set-Cookie', cookie(CSRF_COOKIE, '', { httpOnly: false, maxAge: 0 }));
}

/** Bearer tokens are explicit credentials, so they skip the CSRF check. */
export function isCookieSession(req: Request): boolean {
  return !req.headers.authorization?.startsWith('Bearer ');
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!isCookieSession(req)) return next(); // explicit bearer credential, no ambient authority
  const cookies = parseCookies(req.headers.cookie);
  // No session cookie → nothing ambient to forge; let requireAuth answer with 401.
  if (!cookies[AUTH_COOKIE]) return next();
  const expected = cookies[CSRF_COOKIE];
  const provided = req.headers[CSRF_HEADER];
  if (!expected || typeof provided !== 'string' || provided !== expected) {
    return res.status(403).json({ error: 'Missing or invalid CSRF token' });
  }
  next();
}

/* ------------------------------------------------------------ rate limiting */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
  message?: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.method}:${req.path}:${opts.key ? opts.key(req) : clientIp(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      res.setHeader('X-RateLimit-Remaining', String(opts.max - 1));
      return next();
    }
    bucket.count += 1;
    const remaining = Math.max(opts.max - bucket.count, 0);
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (bucket.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res
        .status(429)
        .json({ error: opts.message ?? 'Too many requests, please slow down and try again shortly' });
    }
    next();
  };
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Drop expired buckets so the map cannot grow without bound. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000).unref();

/* -------------------------------------------------------- security headers */

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // The SPA is same-origin and self-contained: no CDNs, no inline scripts.
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    // Tailwind/React set style attributes at runtime; style attributes are not
    // covered by 'unsafe-inline' for <style> elements only, so keep it minimal.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

/** Only emit CORS headers for explicitly allow-listed origins. */
export function corsPolicy(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
  } else if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
}

/* ------------------------------------------------------------------- misc */

/**
 * Spreadsheet formula injection guard. Any cell that starts with a character
 * Excel/Sheets would treat as a formula gets a leading apostrophe so it stays
 * inert text.
 */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
