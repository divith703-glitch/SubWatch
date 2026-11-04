import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { JWT_SECRET, TOKEN_TTL } from './env.js';
import { AUTH_COOKIE, parseCookies } from './security.js';

export { JWT_SECRET, TOKEN_TTL };

export type UserRow = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  currency: string;
  token_version: number;
  created_at: string;
};

export type AuthedRequest = Request & { user: UserRow };

/** bcrypt cost factor — 12 rounds is the current sensible default for new hashes. */
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, BCRYPT_ROUNDS);
}

export function verifyPassword(pw: string, hash: string): boolean {
  return bcrypt.compareSync(pw, hash);
}

export function ttlSeconds(): number {
  const ttl = TOKEN_TTL;
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 12 * 60 * 60;
  const n = Number(match[1]);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd'];
}

/**
 * Tokens carry `tv` (token version). Bumping `users.token_version` — on logout,
 * password change or account deletion — invalidates every token issued before
 * that point, which gives us revocation without a session table.
 */
export function signToken(user: UserRow): string {
  const options: jwt.SignOptions = {
    expiresIn: TOKEN_TTL as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  };
  return jwt.sign({ uid: user.id, tv: user.token_version ?? 0 }, JWT_SECRET, options);
}

export function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  const cookies = parseCookies(req.headers.cookie);
  return cookies[AUTH_COOKIE] ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as {
      uid: number;
      tv?: number;
    };
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid) as
      | UserRow
      | undefined;
    if (!user) return res.status(401).json({ error: 'Account not found' });
    if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
      return res.status(401).json({ error: 'Session revoked, please sign in again' });
    }
    (req as AuthedRequest).user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

export function revokeSessions(userId: number) {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
}
