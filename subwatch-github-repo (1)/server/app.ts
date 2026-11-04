import './env.js';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import {
  hashPassword,
  readToken,
  requireAuth,
  revokeSessions,
  signToken,
  ttlSeconds,
  verifyPassword,
  type AuthedRequest,
  type UserRow,
} from './auth.js';
import { CATALOG, findCatalogEntry } from './catalog.js';
import {
  analytics,
  decorate,
  getSubscriptions,
  recordPriceChange,
  type PriceChangeRow,
  type SubRow,
} from './service.js';
import { CATEGORIES, CYCLES, CYCLE_LABEL, CURRENCY_SYMBOL, todayISO } from './util.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './env.js';

/** Verify a token and return its payload (throws on invalid/expired). */
function jwtVerify(token: string): { uid: number; tv?: number } {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { uid: number; tv?: number };
}
import { DEMO_ENABLED, IS_PROD, PROVIDER_SYNC_SIMULATED, ALLOWED_ORIGINS } from './env.js';
import {
  clearSessionCookies,
  clientIp,
  corsPolicy,
  csrfProtection,
  csvCell,
  issueSessionCookies,
  rateLimit,
  securityHeaders,
} from './security.js';

/* ------------------------------------------------------------------ helpers */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const subscriptionInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  category: z.string().trim().min(1).max(40).default('Other'),
  cost: z.coerce.number().positive('Cost must be greater than 0').max(10_000_000),
  currency: z.string().trim().length(3).default('USD'),
  billing_cycle: z.enum(['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly']).default('monthly'),
  next_renewal_date: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
  started_on: z.string().regex(ISO_DATE).nullish(),
  status: z.enum(['active', 'paused', 'cancelled']).default('active'),
  payment_method: z.string().max(60).nullish(),
  cancel_url: z.string().max(300).nullish(),
  cancel_instructions: z.string().max(2000).nullish(),
  notes: z.string().max(1000).nullish(),
  reminder_days: z.coerce.number().int().min(0).max(90).default(7),
});

function fail(res: express.Response, status: number, message: string, extra?: unknown) {
  return res.status(status).json({ error: message, ...(extra ? { details: extra } : {}) });
}

function firstIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  return issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input';
}

function publicUser(user: UserRow) {
  return { id: user.id, name: user.name, email: user.email, currency: user.currency };
}

function wantsToken(req: express.Request): boolean {
  // Tokens are not returned to the bundled browser client (it uses HttpOnly
  // cookies); scripts can opt in explicitly.
  return req.headers['x-token-response'] === '1' || req.query.token === '1';
}

/** Ownership guard: every single-record route resolves through this. */
function ownedSubscription(req: express.Request, id: string | string[]): SubRow | undefined {
  const user = (req as AuthedRequest).user;
  const numeric = Number(Array.isArray(id) ? id[0] : id);
  if (!Number.isInteger(numeric) || numeric <= 0) return undefined;
  return db
    .prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?')
    .get(numeric, user.id) as SubRow | undefined;
}

/* --------------------------------------------------------------------- app */

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use(corsPolicy);
  app.use(express.json({ limit: '100kb' }));

  // Structured request log — no bodies, no credentials.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || req.path === '/api/health') return next();
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const line = {
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(ms),
        ip: clientIp(req),
        uid: (req as AuthedRequest).user?.id,
      };
      console.log(JSON.stringify(line));
    });
    next();
  });

  // Global ceiling, then tighter limits on the credential endpoints.
  app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));

  // CSRF: state-changing requests made with the ambient session cookie must
  // echo the double-submit token. Login/register have no session yet.
  app.use('/api', (req, res, next) => {
    if (req.path === '/auth/login' || req.path === '/auth/register') return next();
    return csrfProtection(req, res, next);
  });

  const loginLimit = rateLimit({
    windowMs: 15 * 60_000,
    max: Number(process.env.LOGIN_RATE_LIMIT ?? 10),
    key: (req) => `${clientIp(req)}:${String((req.body as { email?: string })?.email ?? '')}`,
    message: 'Too many sign-in attempts. Try again in a few minutes.',
  });
  const registerLimit = rateLimit({
    windowMs: 60 * 60_000,
    max: Number(process.env.REGISTER_RATE_LIMIT ?? 5),
    message: 'Too many accounts created from this address. Try again later.',
  });

  /* ------------------------------------------------------------------ auth */

  app.get('/api/health', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ ok: true, db: 'up', time: new Date().toISOString(), version: 1 });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  app.post('/api/auth/register', registerLimit, (req, res) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(60),
        email: z.string().trim().toLowerCase().email().max(200),
        password: z
          .string()
          .min(10, 'Use at least 10 characters')
          .max(200, 'Password is too long')
          .refine((p) => !/^(password|123456|qwerty)/i.test(p), 'Choose a less predictable password'),
        currency: z.string().trim().length(3).default('USD'),
      })
      .safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));

    const { name, email, password, currency } = parsed.data;
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return fail(res, 409, 'An account with that email already exists');

    const info = db
      .prepare(
        'INSERT INTO users (email, name, password_hash, currency, token_version, created_at) VALUES (?, ?, ?, ?, 0, ?)'
      )
      .run(email, name, hashPassword(password), currency.toUpperCase(), new Date().toISOString());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as UserRow;
    issueSessionCookies(res, signToken(user), ttlSeconds());
    res.status(201).json({
      user: publicUser(user),
      ...(wantsToken(req) ? { token: signToken(user) } : {}),
    });
  });

  app.post('/api/auth/login', loginLimit, (req, res) => {
    const parsed = z
      .object({
        email: z.string().trim().toLowerCase().email().max(200),
        password: z.string().min(1).max(200),
      })
      .safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Email or password is incorrect');

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(parsed.data.email) as
      | UserRow
      | undefined;
    // Constant-ish response regardless of which factor was wrong.
    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      return fail(res, 401, 'Email or password is incorrect');
    }
    issueSessionCookies(res, signToken(user), ttlSeconds());
    res.json({
      user: publicUser(user),
      ...(wantsToken(req) ? { token: signToken(user) } : {}),
    });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    revokeSessions((req as AuthedRequest).user.id);
    clearSessionCookies(res);
    res.json({ ok: true });
  });

  /** Optional-auth probe so the SPA can boot without a noisy 401. */
  app.get('/api/auth/session', (req, res) => {
    const token = readToken(req);
    if (!token) return res.json({ user: null });
    try {
      const payload = jwtVerify(token);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid) as
        | UserRow
        | undefined;
      if (!user || (payload.tv ?? 0) !== (user.token_version ?? 0)) return res.json({ user: null });
      return res.json({ user: publicUser(user) });
    } catch {
      return res.json({ user: null });
    }
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: publicUser((req as AuthedRequest).user) });
  });

  app.patch('/api/auth/me', requireAuth, (req, res) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(60).optional(),
        currency: z.string().trim().length(3).optional(),
        current_password: z.string().max(200).optional(),
        new_password: z.string().min(10).max(200).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));

    const u = (req as AuthedRequest).user;
    const { name, currency, current_password, new_password } = parsed.data;

    if (new_password) {
      if (!current_password || !verifyPassword(current_password, u.password_hash)) {
        return fail(res, 403, 'Current password is incorrect');
      }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        hashPassword(new_password),
        u.id
      );
      revokeSessions(u.id); // force re-login on other devices
    }

    db.prepare(
      'UPDATE users SET name = COALESCE(?, name), currency = COALESCE(?, currency) WHERE id = ?'
    ).run(name ?? null, currency?.toUpperCase() ?? null, u.id);

    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id) as UserRow;
    res.json({ user: publicUser(fresh), password_changed: Boolean(new_password) });
  });

  /* ------------------------------------------------------- account deletion */

  app.delete('/api/account', requireAuth, (req, res) => {
    const u = (req as AuthedRequest).user;
    const parsed = z.object({ password: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Password confirmation is required');
    if (!verifyPassword(parsed.data.password, u.password_hash)) {
      return fail(res, 403, 'Password is incorrect');
    }

    const remaining = db.transaction(() => {
      db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(u.id); // cascades to price_changes
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
      const orphaned = db
        .prepare('SELECT COUNT(*) AS c FROM price_changes WHERE subscription_id NOT IN (SELECT id FROM subscriptions)')
        .get() as { c: number };
      return orphaned.c;
    })();

    clearSessionCookies(res);
    res.json({ ok: true, orphaned_price_changes: remaining });
  });

  /* ------------------------------------------------------------------ meta */

  app.get('/api/meta', (_req, res) => {
    res.json({
      categories: CATEGORIES,
      cycles: CYCLES.map((c) => ({ value: c, label: CYCLE_LABEL[c] })),
      currencies: Object.keys(CURRENCY_SYMBOL),
      demo_enabled: DEMO_ENABLED,
      provider_sync: {
        available: PROVIDER_SYNC_SIMULATED,
        simulated: true,
        note: 'Compares recorded prices against a simulated provider feed. Not connected to real billing data.',
      },
      csrf_header: 'x-csrf-token',
      token_ttl_seconds: ttlSeconds(),
      allowed_origins: ALLOWED_ORIGINS,
    });
  });

  /* --------------------------------------------------------- subscriptions */

  app.get('/api/subscriptions', requireAuth, (req, res) => {
    res.json({ subscriptions: getSubscriptions((req as AuthedRequest).user.id) });
  });

  app.post('/api/subscriptions', requireAuth, (req, res) => {
    const parsed = subscriptionInput.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const user = (req as AuthedRequest).user;
    const d = parsed.data;
    const guide = findCatalogEntry(d.name);
    const now = new Date().toISOString();

    const info = db
      .prepare(
        `INSERT INTO subscriptions
          (user_id, name, category, cost, currency, billing_cycle, next_renewal_date, started_on, status,
           payment_method, cancel_url, cancel_instructions, notes, reminder_days, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        user.id,
        d.name,
        d.category === 'Other' && guide ? guide.category : d.category,
        d.cost,
        (d.currency || user.currency).toUpperCase(),
        d.billing_cycle,
        d.next_renewal_date,
        d.started_on ?? todayISO(),
        d.status,
        d.payment_method ?? null,
        d.cancel_url ?? guide?.cancelUrl ?? null,
        d.cancel_instructions ?? (guide ? guide.steps.map((s) => `• ${s}`).join('\n') : null),
        d.notes ?? null,
        d.reminder_days,
        now,
        now
      );

    // Log the opening price so later changes always have a baseline to compare against.
    recordPriceChange({
      subscriptionId: Number(info.lastInsertRowid),
      oldCost: d.cost,
      newCost: d.cost,
      currency: (d.currency || user.currency).toUpperCase(),
      billingCycle: d.billing_cycle,
      source: 'created',
      note: 'Subscription added',
    });

    const row = db
      .prepare('SELECT * FROM subscriptions WHERE id = ?')
      .get(info.lastInsertRowid) as SubRow;
    res.status(201).json({ subscription: decorate(row) });
  });

  app.patch('/api/subscriptions/:id', requireAuth, (req, res) => {
    const user = (req as AuthedRequest).user;
    const row = ownedSubscription(req, req.params.id);
    if (!row) return fail(res, 404, 'Subscription not found');

    const parsed = subscriptionInput.partial().safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const d = parsed.data;

    const nextCost = d.cost ?? row.cost;
    const nextCycle = d.billing_cycle ?? row.billing_cycle;
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE subscriptions SET
         name = ?, category = ?, cost = ?, currency = ?, billing_cycle = ?, next_renewal_date = ?,
         started_on = ?, status = ?, payment_method = ?, cancel_url = ?, cancel_instructions = ?,
         notes = ?, reminder_days = ?, cancelled_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      d.name ?? row.name,
      d.category ?? row.category,
      nextCost,
      (d.currency ?? row.currency).toUpperCase(),
      nextCycle,
      d.next_renewal_date ?? row.next_renewal_date,
      d.started_on ?? row.started_on,
      d.status ?? row.status,
      d.payment_method ?? row.payment_method,
      d.cancel_url ?? row.cancel_url,
      d.cancel_instructions ?? row.cancel_instructions,
      d.notes ?? row.notes,
      d.reminder_days ?? row.reminder_days,
      d.status === 'cancelled' ? (row.cancelled_at ?? now) : d.status ? null : row.cancelled_at,
      now,
      row.id,
      user.id
    );

    // Price-change detection: any cost difference creates an auditable entry.
    const costChanged = Math.abs(Number(nextCost) - Number(row.cost)) > 0.004;
    const cycleChanged = nextCycle !== row.billing_cycle;
    if (costChanged || cycleChanged) {
      recordPriceChange({
        subscriptionId: row.id,
        oldCost: row.cost,
        newCost: Number(nextCost),
        currency: (d.currency ?? row.currency).toUpperCase(),
        billingCycle: nextCycle,
        source: 'manual',
        note: typeof req.body?.change_note === 'string' ? req.body.change_note.slice(0, 200) : null,
      });
    }

    const fresh = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(row.id) as SubRow;
    res.json({ subscription: decorate(fresh), price_change_logged: costChanged || cycleChanged });
  });

  app.delete('/api/subscriptions/:id', requireAuth, (req, res) => {
    const row = ownedSubscription(req, req.params.id);
    if (!row) return fail(res, 404, 'Subscription not found');
    db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').run(
      row.id,
      (req as AuthedRequest).user.id
    );
    res.json({ ok: true });
  });

  app.get('/api/subscriptions/:id/history', requireAuth, (req, res) => {
    const row = ownedSubscription(req, req.params.id);
    if (!row) return fail(res, 404, 'Subscription not found');
    const changes = db
      .prepare('SELECT * FROM price_changes WHERE subscription_id = ? ORDER BY changed_at DESC, id DESC')
      .all(row.id) as PriceChangeRow[];
    res.json({
      subscription: decorate(row),
      history: changes.map((c) => ({
        id: c.id,
        old_cost: c.old_cost,
        new_cost: c.new_cost,
        delta: Math.round((c.new_cost - c.old_cost) * 100) / 100,
        currency: c.currency,
        billing_cycle: c.billing_cycle,
        source: c.source,
        note: c.note,
        changed_at: c.changed_at,
      })),
    });
  });

  /* -------------------------------------------------------------- analytics */

  app.get('/api/analytics/summary', requireAuth, (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json(analytics(user.id, user.currency));
  });

  /**
   * Renewal reminders, scheduler-friendly: everything inside its own reminder
   * window right now. Delivery (email/push) is a separate worker responsibility —
   * see README → "Renewal reminders".
   */
  app.get('/api/reminders', requireAuth, (req, res) => {
    const subs = getSubscriptions((req as AuthedRequest).user.id);
    const due = subs
      .filter(
        (s) =>
          s.status === 'active' &&
          s.days_until_renewal >= 0 &&
          s.days_until_renewal <= s.reminder_days
      )
      .sort((a, b) => a.days_until_renewal - b.days_until_renewal);
    res.json({
      count: due.length,
      due_in_next_7_days: due.filter((s) => s.days_until_renewal <= 7).length,
      total_amount: Math.round(due.reduce((a, s) => a + s.cost, 0) * 100) / 100,
      reminders: due.map((s) => ({
        subscription_id: s.id,
        name: s.name,
        amount: s.cost,
        currency: s.currency,
        billing_cycle: s.billing_cycle,
        renews_on: s.next_renewal_date,
        days_until: s.days_until_renewal,
        cancel_url: s.cancel_url,
      })),
    });
  });

  /* --------------------------------------------------- price-change detection */

  /**
   * SIMULATED provider feed. There is no connection to real provider billing
   * data here: a stable hash decides which subscriptions the "provider" has
   * repriced this month, and a plausible 4–12% increase is applied. Real
   * integrations (billing APIs, open banking, receipt parsing) would call
   * `recordPriceChange` from the same place. Disabled unless explicitly enabled.
   */
  app.post(
    '/api/provider-sync',
    requireAuth,
    rateLimit({ windowMs: 60 * 60_000, max: 20, key: (req) => String((req as AuthedRequest).user?.id) }),
    (req, res) => {
      if (!PROVIDER_SYNC_SIMULATED) {
        return fail(
          res,
          501,
          'Provider price sync is not configured. Connect a billing data source before enabling it.'
        );
      }

      const user = (req as AuthedRequest).user;
      const subs = getSubscriptions(user.id).filter((s) => s.status === 'active');
      const monthKey = new Date().toISOString().slice(0, 7);
      const recent = db
        .prepare(
          `SELECT pc.subscription_id FROM price_changes pc
           JOIN subscriptions s ON s.id = pc.subscription_id
           WHERE s.user_id = ? AND pc.source = 'provider-sync' AND pc.changed_at >= ?`
        )
        .all(user.id, `${monthKey}-01`) as { subscription_id: number }[];
      const already = new Set(recent.map((r) => r.subscription_id));

      const changes: { id: number; name: string; old_cost: number; new_cost: number; delta_pct: number }[] =
        [];

      for (const sub of subs) {
        if (already.has(sub.id)) continue;
        const seed = [...`${sub.name}${monthKey}`].reduce(
          (a, c) => (a * 31 + c.charCodeAt(0)) % 997,
          7
        );
        if (seed % 3 !== 0) continue;

        const pct = 4 + (seed % 9); // 4% – 12%
        const raw = sub.cost * (1 + pct / 100);
        const newCost =
          sub.billing_cycle === 'yearly' || sub.billing_cycle === 'semiannual'
            ? Math.round(raw)
            : Math.round(raw * 100 - 1) / 100;
        if (newCost <= sub.cost) continue;

        db.prepare('UPDATE subscriptions SET cost = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
          newCost,
          new Date().toISOString(),
          sub.id,
          user.id
        );
        recordPriceChange({
          subscriptionId: sub.id,
          oldCost: sub.cost,
          newCost,
          currency: sub.currency,
          billingCycle: sub.billing_cycle,
          source: 'provider-sync',
          note: 'Detected from provider billing feed (simulated)',
        });
        changes.push({
          id: sub.id,
          name: sub.name,
          old_cost: sub.cost,
          new_cost: newCost,
          delta_pct: Math.round(((newCost - sub.cost) / sub.cost) * 1000) / 10,
        });
      }

      res.json({
        simulated: true,
        checked: subs.length,
        changes,
        scanned_at: new Date().toISOString(),
        message: changes.length
          ? `${changes.length} price change${changes.length > 1 ? 's' : ''} detected (simulated feed)`
          : 'No price changes detected — everything is at the price you recorded',
      });
    }
  );

  /* ----------------------------------------------------------------- catalog */

  app.get('/api/catalog', (req, res) => {
    const q = String(req.query.q ?? '').toLowerCase().trim().slice(0, 60);
    const items = CATALOG.filter(
      (e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.aliases.some((a) => a.includes(q))
    ).map(({ key, name, category, cancelUrl, steps, typicalPrice, currency }) => ({
      key,
      name,
      category,
      cancel_url: cancelUrl,
      steps,
      typical_price: typicalPrice,
      currency,
    }));
    res.json({ items });
  });

  /* ------------------------------------------------------------------ export */

  app.get('/api/export.csv', requireAuth, (req, res) => {
    const subs = getSubscriptions((req as AuthedRequest).user.id);
    const header = [
      'name',
      'category',
      'status',
      'cost',
      'currency',
      'billing_cycle',
      'monthly_cost',
      'yearly_cost',
      'next_renewal_date',
      'started_on',
      'payment_method',
      'cancel_url',
    ];
    const lines = [
      header.join(','),
      ...subs.map((s) =>
        [
          s.name,
          s.category,
          s.status,
          s.cost,
          s.currency,
          s.billing_cycle,
          s.monthly_cost,
          s.yearly_cost,
          s.next_renewal_date,
          s.started_on,
          s.payment_method,
          s.cancel_url,
        ]
          .map(csvCell)
          .join(',')
      ),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="subwatch-subscriptions.csv"');
    res.send(lines.join('\n'));
  });

  /* --------------------------------------------------------------- demo data */

  app.post('/api/demo/seed', requireAuth, (req, res) => {
    if (!DEMO_ENABLED) return fail(res, 404, 'Demo data is disabled on this deployment');
    // Imported lazily so production builds never pull demo fixtures into hot paths.
    void import('./seed.js').then(({ seedDemoUser }) => {
      const user = (req as AuthedRequest).user;
      seedDemoUser(user.id, { onlyIfEmpty: true });
      res.json({ ok: true, subscriptions: getSubscriptions(user.id) });
    });
  });

  app.delete('/api/account/data', requireAuth, (req, res) => {
    const user = (req as AuthedRequest).user;
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(user.id);
    res.json({ ok: true });
  });

  /* -------------------------------------------------------------- frontend */

  const clientDist = path.join(process.cwd(), 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(
      express.static(clientDist, {
        maxAge: IS_PROD ? '1h' : 0,
        index: false,
        dotfiles: 'deny',
      })
    );
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((_req, res) => fail(res, 404, 'Not found'));

  /* Runtime error handler keeps the API JSON-shaped and never leaks internals. */
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status =
        (err as Error & { status?: number; statusCode?: number }).status ??
        (err as Error & { statusCode?: number }).statusCode ??
        500;

      if (status >= 500) {
        const ref = crypto.randomBytes(6).toString('hex');
        console.error(
          JSON.stringify({
            level: 'error',
            ref,
            message: err.message,
            stack: IS_PROD ? undefined : err.stack,
          })
        );
        if (res.headersSent) return;
        return fail(res, 500, 'Something went wrong on the server', IS_PROD ? undefined : { ref });
      }

      // Client errors (malformed JSON, oversized body, bad content type) are
      // reported without internals.
      if (res.headersSent) return;
      const message =
        status === 413
          ? 'Request body is too large'
          : status === 400
            ? 'Malformed request body'
            : 'Request could not be processed';
      return fail(res, status, message);
    }
  );

  return app;
}

