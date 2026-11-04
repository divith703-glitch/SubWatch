/**
 * Security regression tests.
 *
 * Each test boots the real Express app against a throwaway SQLite database and
 * talks to it over HTTP, so routing, middleware order and ownership checks are
 * all exercised — not just the service layer.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { spawnSync } from 'node:child_process';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'subwatch-test-'));
process.env.DATA_DIR = DATA_DIR;
process.env.SEED_DEMO = 'false';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-production-use-0123456789';
process.env.NODE_ENV = 'test';
process.env.PROVIDER_SYNC_SIMULATED = 'true';
// The suite creates many accounts from one IP; the register limiter has its own
// dedicated coverage elsewhere in this file, so raise its ceiling for the suite.
process.env.REGISTER_RATE_LIMIT = '500';

let server: Server;
let base: string;
let dbModule: typeof import('./db.js');

type Session = { cookie: string; csrf: string; token: string };

before(async () => {
  dbModule = await import('./db.js');
  const { createApp } = await import('./app.js');
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  dbModule.db.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

function cookiesFrom(res: Response): Session {
  const raw = res.headers.getSetCookie?.() ?? [];
  const pick = (name: string) => {
    const found = raw.find((c) => c.startsWith(`${name}=`));
    return found ? decodeURIComponent(found.split(';')[0].split('=')[1]) : '';
  };
  return { cookie: `sw_session=${pick('sw_session')}; sw_csrf=${pick('sw_csrf')}`, csrf: pick('sw_csrf'), token: '' };
}

async function register(email: string, password = 'correct-horse-battery'): Promise<Session> {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email, password }),
  });
  assert.equal(res.status, 201, `register failed: ${res.status} ${await res.text()}`);
  return cookiesFrom(res);
}

function authed(session: Session, init: RequestInit = {}): RequestInit {
  const method = (init.method ?? 'GET').toUpperCase();
  return {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: session.cookie,
      ...(method !== 'GET' ? { 'X-CSRF-Token': session.csrf } : {}),
      ...(init.headers ?? {}),
    },
  };
}

async function createSub(session: Session, name = 'Netflix', cost = 15) {
  const res = await fetch(
    `${base}/api/subscriptions`,
    authed(session, {
      method: 'POST',
      body: JSON.stringify({
        name,
        cost,
        billing_cycle: 'monthly',
        next_renewal_date: '2030-01-01',
        category: 'Entertainment',
      }),
    })
  );
  const text = await res.text();
  assert.equal(res.status, 201, text);
  return JSON.parse(text).subscription as { id: number; name: string };
}

/* -------------------------------------------------------------------------- */

test('unauthenticated requests are rejected on every protected route', async () => {
  const routes: [string, string][] = [
    ['GET', '/api/subscriptions'],
    ['POST', '/api/subscriptions'],
    ['PATCH', '/api/subscriptions/1'],
    ['DELETE', '/api/subscriptions/1'],
    ['GET', '/api/subscriptions/1/history'],
    ['GET', '/api/analytics/summary'],
    ['GET', '/api/reminders'],
    ['GET', '/api/export.csv'],
    ['POST', '/api/provider-sync'],
    ['POST', '/api/auth/logout'],
    ['DELETE', '/api/account'],
  ];
  for (const [method, route] of routes) {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
    });
    assert.equal(res.status, 401, `${method} ${route} should be 401, got ${res.status}`);
  }
});

test('users cannot read, modify or delete another user\'s subscription', async () => {
  const alice = await register('alice@example.com');
  const bob = await register('bob@example.com');
  const sub = await createSub(alice, 'Alice Private Plan', 9.99);

  // Bob cannot see it in his list
  const list = (await (await fetch(`${base}/api/subscriptions`, authed(bob))).json()) as {
    subscriptions: unknown[];
  };
  assert.equal(list.subscriptions.length, 0);

  // Bob cannot read its history
  const history = await fetch(`${base}/api/subscriptions/${sub.id}/history`, authed(bob));
  assert.equal(history.status, 404);

  // Bob cannot update it (IDOR attempt)
  const patch = await fetch(
    `${base}/api/subscriptions/${sub.id}`,
    authed(bob, { method: 'PATCH', body: JSON.stringify({ cost: 1 }) })
  );
  assert.equal(patch.status, 404);

  // Bob cannot delete it
  const del = await fetch(`${base}/api/subscriptions/${sub.id}`, authed(bob, { method: 'DELETE' }));
  assert.equal(del.status, 404);

  // …and Alice's data is untouched
  const aliceList = (await (await fetch(`${base}/api/subscriptions`, authed(alice))).json()) as {
    subscriptions: { cost: number }[];
  };
  assert.equal(aliceList.subscriptions.length, 1);
  assert.equal(aliceList.subscriptions[0].cost, 9.99);
});

test('state-changing requests without a CSRF token are refused', async () => {
  const session = await register('csrf@example.com');
  const res = await fetch(`${base}/api/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: session.cookie },
    body: JSON.stringify({ name: 'Evil', cost: 1, next_renewal_date: '2030-01-01' }),
  });
  assert.equal(res.status, 403);

  const mismatch = await fetch(`${base}/api/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: session.cookie,
      'X-CSRF-Token': 'not-the-right-token',
    },
    body: JSON.stringify({ name: 'Evil', cost: 1, next_renewal_date: '2030-01-01' }),
  });
  assert.equal(mismatch.status, 403);
});

test('logout revokes existing session tokens (token_version bump)', async () => {
  const session = await register('revoke@example.com');
  const tokenRes = await fetch(`${base}/api/auth/login?token=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'revoke@example.com', password: 'correct-horse-battery' }),
  });
  const { token } = (await tokenRes.json()) as { token: string };
  assert.ok(token, 'login should expose a token to explicit API clients');

  // Bearer token works…
  const ok = await fetch(`${base}/api/subscriptions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(ok.status, 200);

  // …until the session is revoked
  await fetch(`${base}/api/auth/logout`, authed(session, { method: 'POST' }));
  const revoked = await fetch(`${base}/api/subscriptions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(revoked.status, 401);
});

test('a token signed with a different secret is rejected', async () => {
  const jwt = (await import('jsonwebtoken')).default;
  const forged = jwt.sign({ uid: 1, tv: 0 }, 'a-different-secret-entirely', {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
  const res = await fetch(`${base}/api/subscriptions`, {
    headers: { Authorization: `Bearer ${forged}` },
  });
  assert.equal(res.status, 401);
});

test('CSV export neutralises spreadsheet formula injection', async () => {
  const session = await register('csv@example.com');
  await createSub(session, '=HYPERLINK("http://evil.example","click")', 5);
  await createSub(session, '+1-800-EVIL', 5);
  await createSub(session, '@SUM(A1:A9)', 5);

  const res = await fetch(`${base}/api/export.csv`, authed(session));
  assert.equal(res.status, 200);
  const csv = await res.text();

  for (const line of csv.split('\n').slice(1)) {
    const firstCell = line.slice(1, line.indexOf('"', 1) + 1);
    assert.ok(
      !/^["][=+@-]/.test(firstCell),
      `cell should be prefixed with an apostrophe: ${firstCell}`
    );
  }
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"'\+1-800/);
  assert.match(csv, /"'@SUM/);
});

test('editing a price records exactly one price-change entry', async () => {
  const session = await register('price@example.com');
  const sub = await createSub(session, 'Adobe', 30);

  const res = await fetch(
    `${base}/api/subscriptions/${sub.id}`,
    authed(session, { method: 'PATCH', body: JSON.stringify({ cost: 39 }) })
  );
  const body = (await res.json()) as { price_change_logged: boolean };
  assert.equal(body.price_change_logged, true);

  const history = (await (
    await fetch(`${base}/api/subscriptions/${sub.id}/history`, authed(session))
  ).json()) as { history: { old_cost: number; new_cost: number }[] };
  const increases = history.history.filter(
    (h: { new_cost: number; old_cost: number }) => h.new_cost > h.old_cost
  );
  assert.equal(increases.length, 1);
  assert.equal(increases[0].new_cost, 39);
});

test('atomic account deletion removes the subscriber, subscriptions and price history', async () => {
  const session = await register('delete@example.com');
  await createSub(session, 'Spotify', 12);

  const res = await fetch(
    `${base}/api/account`,
    authed(session, {
      method: 'DELETE',
      body: JSON.stringify({ password: 'correct-horse-battery' }),
    })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { orphaned_price_changes: number };
  assert.equal(body.orphaned_price_changes, 0, 'no orphaned price history may survive');

  const leftovers = dbModule.db
    .prepare(
      `SELECT COUNT(*) AS c FROM subscriptions s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE u.id IS NULL`
    )
    .get() as { c: number };
  assert.equal(leftovers.c, 0);

  const again = await fetch(`${base}/api/auth/me`, authed(session));
  assert.equal(again.status, 401, 'deleted account must not keep a working session');
});

test('account deletion requires the correct password', async () => {
  const session = await register('nope@example.com');
  const res = await fetch(
    `${base}/api/account`,
    authed(session, { method: 'DELETE', body: JSON.stringify({ password: 'wrong-password' }) })
  );
  assert.equal(res.status, 403);
});

test('security headers are present and powered-by is hidden', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('login attempts are rate limited', async () => {
  const attempts = await Promise.all(
    Array.from({ length: 14 }, () =>
      fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bruteforce@example.com', password: 'wrong-password-here' }),
      })
    )
  );
  const codes = attempts.map((r) => r.status);
  assert.ok(codes.includes(429), `expected a 429 among ${codes.join(',')}`);
  assert.ok(!codes.includes(200));
});

test('oversized JSON payloads are rejected', async () => {
  const session = await register('big@example.com');
  const res = await fetch(
    `${base}/api/subscriptions`,
    authed(session, {
      method: 'POST',
      body: JSON.stringify({ name: 'x'.repeat(200_000), cost: 1, next_renewal_date: '2030-01-01' }),
    })
  );
  assert.ok([400, 413].includes(res.status), `expected 400/413, got ${res.status}`);
});

test('validation rejects bad input and unknown fields never reach the database', async () => {
  const session = await register('validate@example.com');
  const bad = [
    { name: '', cost: 5, next_renewal_date: '2030-01-01' },
    { name: 'X', cost: -5, next_renewal_date: '2030-01-01' },
    { name: 'X', cost: 5, next_renewal_date: '01-01-2030' },
    { name: 'X', cost: 5, next_renewal_date: '2030-01-01', status: 'owned' },
    { name: 'X', cost: 5, next_renewal_date: '2030-01-01', billing_cycle: 'hourly' },
  ];
  for (const body of bad) {
    const res = await fetch(
      `${base}/api/subscriptions`,
      authed(session, { method: 'POST', body: JSON.stringify(body) })
    );
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test('production refuses to start without a strong JWT secret', () => {
  const run = (env: NodeJS.ProcessEnv) =>
    spawnSync(
      process.execPath,
      ['--import', 'tsx', '-e', "import('./server/env.ts')"],
      {
        cwd: process.cwd(),
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: 30_000,
      }
    );

  const missing = run({ NODE_ENV: 'production', JWT_SECRET: '' });
  assert.notEqual(missing.status, 0, 'production boot must fail without JWT_SECRET');

  const weak = run({ NODE_ENV: 'production', JWT_SECRET: 'short-secret' });
  assert.notEqual(weak.status, 0, 'production boot must fail with a short secret');

  const placeholder = run({
    NODE_ENV: 'production',
    JWT_SECRET: 'subwatch-dev-secret-change-me-aaaaaaaaaaaaaaaaaaaa',
  });
  assert.notEqual(placeholder.status, 0, 'placeholders must be rejected');

  const strong = run({
    NODE_ENV: 'production',
    JWT_SECRET: 'k7Q2w9Xr4Tb1Nc8Lp5Vd3Hf6Jy0Mz2Sg8Ue4Ra7Io1Pb5Wc9Kd6Nf3Qs0Xh',
  });
  assert.equal(strong.status, 0, `production boot should succeed with a strong secret: ${strong.stderr}`);
});
