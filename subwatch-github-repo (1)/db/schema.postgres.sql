-- SubWatch — PostgreSQL schema.
-- The app ships with SQLite for zero-setup local development, but the data model
-- and queries are portable. To switch: run this file, then point `server/db.ts` at
-- the `pg` driver (the only file that imports the SQLite driver).

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  currency      CHAR(3) NOT NULL DEFAULT 'USD',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'Other',
  cost                NUMERIC(12,2) NOT NULL CHECK (cost > 0),
  currency            CHAR(3) NOT NULL DEFAULT 'USD',
  billing_cycle       TEXT NOT NULL DEFAULT 'monthly'
                      CHECK (billing_cycle IN ('weekly','monthly','quarterly','semiannual','yearly')),
  next_renewal_date   DATE NOT NULL,
  started_on          DATE,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','paused','cancelled')),
  payment_method      TEXT,
  cancel_url          TEXT,
  cancel_instructions TEXT,
  notes               TEXT,
  reminder_days       SMALLINT NOT NULL DEFAULT 7,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_renewal ON subscriptions(user_id, next_renewal_date);

CREATE TABLE IF NOT EXISTS price_changes (
  id              SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  old_cost        NUMERIC(12,2) NOT NULL,
  new_cost        NUMERIC(12,2) NOT NULL,
  currency        CHAR(3) NOT NULL,
  billing_cycle   TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('created','manual','provider-sync','import')),
  note            TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_sub ON price_changes(subscription_id, changed_at DESC);
