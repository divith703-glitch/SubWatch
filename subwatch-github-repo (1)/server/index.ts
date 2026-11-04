import './env.js';
import { createApp } from './app.js';
import { db } from './db.js';
import { rollForwardRenewals } from './service.js';
import { DEMO_ENABLED, IS_PROD, NODE_ENV, TRUST_PROXY } from './env.js';
import { seedDemoUser } from './seed.js';

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
if (TRUST_PROXY) app.set('trust proxy', 1);

/* Renewal dates are advanced by a scheduled sweep, never by a read request. */
function renewalSweep(reason: string) {
  try {
    const moved = rollForwardRenewals();
    if (moved > 0) console.log(JSON.stringify({ level: 'info', event: 'renewal-sweep', reason, moved }));
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'renewal-sweep-failed', message: String(err) }));
  }
}

renewalSweep('boot');
const sweepTimer = setInterval(() => renewalSweep('hourly'), 60 * 60 * 1000);
sweepTimer.unref();

/* Demo account: development only unless SEED_DEMO=true is set explicitly. */
if (DEMO_ENABLED) {
  seedDemoUser(0, { createAccount: true });
} else {
  console.log(JSON.stringify({ level: 'info', event: 'demo-disabled', env: NODE_ENV }));
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(
    JSON.stringify({ level: 'info', event: 'listening', port: PORT, env: NODE_ENV, prod: IS_PROD })
  );
});

/* Graceful shutdown so SQLite checkpoints cleanly. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
    server.close(() => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
      process.exit(0);
    });
  });
}
