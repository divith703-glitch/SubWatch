# Security model and audit notes

This document is the honest, current state of SubWatch's security posture. It lists what is
implemented and tested, what is deliberately out of scope for this build, and what must be done
before serving real users.

Last reviewed: 2026-11-02 · Applies to commit `HEAD` of `subwatch/`.

---

## 1. Authentication & session handling

| Control | Implementation |
|---|---|
| Password storage | bcrypt, cost factor 12 (configurable via `BCRYPT_ROUNDS`) |
| Session transport | `HttpOnly; SameSite=Strict` cookie (`sw_session`), `Secure` when `COOKIE_SECURE`/production |
| Token format | JWT (HS256), payload `{ uid, tv }`, default 12h lifetime (`TOKEN_TTL`) |
| Revocation | `users.token_version` is embedded as `tv`; bumping it invalidates every issued token (logout, password change) |
| CSRF | Double-submit token: readable `sw_csrf` cookie must be echoed in `X-CSRF-Token` on non-GET requests. Bearer-authenticated requests are exempt because they carry no ambient authority |
| Login throttling | 10 attempts / 15 min per IP+email (`LOGIN_RATE_LIMIT`), 5 registrations / hour per IP (`REGISTER_RATE_LIMIT`) |
| Account enumeration | Login returns the same message for unknown email and wrong password |
| Registration | Email uniqueness enforced in the DB; minimum 10-character password, predictable-prefix rejection |
| Signing secret | Production **refuses to boot** without `JWT_SECRET` (≥32 chars, placeholder strings rejected). Development generates an ephemeral random secret per boot |

Verified by tests in `server/security.test.ts` (revocation, forged-token rejection, CSRF refusal,
throttling, secret enforcement).

## 2. Authorization & data isolation

- Every subscription route resolves records through `ownedSubscription(req, id)`, which filters on
  `user_id = <authenticated user>`. Cross-tenant IDs return **404**, never 403-with-data or 200.
- List, analytics, reminder, history and CSV routes are all scoped by the authenticated user ID.
- Tested: another user cannot read, list, update, or delete a subscription by ID (IDOR regression
  test), and the owner's data is unchanged after the attempt.

## 3. Input handling

- Every request body is parsed with a Zod schema; unknown keys are stripped, enums are closed,
  numbers are bounded, dates must match `YYYY-MM-DD`.
- JSON bodies are capped at 100 KB; oversized payloads return 413 (tested).
- SQL is always parameterised (`better-sqlite3` prepared statements); no string interpolation of
  user input into SQL.
- CSV export neutralises spreadsheet formula injection: cells beginning with `=`, `+`, `-`, `@`,
  TAB or CR are prefixed with `'` and always quoted (tested).

## 4. Transport & browser hardening

- Security headers on every response: CSP (`default-src 'self'`, no inline scripts,
  `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`;
  HSTS in production. `X-Powered-By` is disabled.
- API responses are `Cache-Control: no-store`.
- CORS emits **no** headers unless `ALLOWED_ORIGINS` is configured (the bundled SPA is same-origin).
- The SPA never stores credentials in `localStorage`/`sessionStorage` — verified in the E2E run.

## 5. Data lifecycle

- `DELETE /api/account` requires the account password, then deletes the user, all subscriptions and
  all price history in a single transaction; it asserts no orphaned price-history rows remain.
  Tested.
- `DELETE /api/account/data` wipes subscriptions only (keeps the account).
- Deleting a subscription cascades to its price history via `ON DELETE CASCADE`.
- `.gitignore` excludes `data/`, `*.db`, `.env`; SQLite files live outside the served static root.

## 6. Logging & errors

- One structured JSON log line per API request (method, path, status, duration, IP, user id). No
  bodies, no cookies, no tokens.
- The error handler maps upstream HTTP errors to safe messages and returns a random reference for
  5xx without stack traces in production.

## 7. Known gaps — do not deploy to production as-is without addressing

1. **No email verification, password reset, or MFA.** Password reset needs an email provider; MFA is
   unbuilt.
2. **Provider price sync is simulated.** `PROVIDER_SYNC_SIMULATED` is disabled by default outside
   development and the UI labels it as simulated. No real provider/bank integration exists yet.
3. **Reminder delivery is not implemented.** `GET /api/reminders` is the data source; an email/push
   worker is required and does not exist in this repo.
4. **SQLite is single-node.** Fine for one process; production needs PostgreSQL (DDL provided in
   `db/schema.postgres.sql`) plus migrations, backups and restore drills.
5. **No FX conversion.** Multi-currency accounts are reported per currency, never summed. There is no
   conversion table.
6. **Demo account.** Seeded only when `SEED_DEMO=true` (default in development, off in production).
   Its credentials are public by design; never enable it on a real deployment.
7. **Rate limiting is in-process.** A multi-instance deployment needs a shared store (Redis).
8. **No audit trail for account-level actions** (profile changes, deletions) beyond request logs.
9. **No privacy policy, ToS, or data-retention automation.** Required before handling real users in
   most jurisdictions.

## Reporting

This is a demo/portfolio project. If you find a vulnerability, open an issue describing the impact
and reproduction steps; please do not include real user data.
