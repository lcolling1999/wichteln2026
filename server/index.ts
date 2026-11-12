import { config } from './config.js';
import { getDatabase } from './db/database.js';
import { initializeSchema } from './db/schema.js';
import { seedDatabase } from './db/seeds.js';
import { createQueryLayer } from './db/queries.js';
import { createApp } from './app.js';
import { processPendingPushNotifications } from './services/push.service.js';

// 1. Initialize SQLite Database & Pragmas
const db = getDatabase();
initializeSchema(db);

// 2. Pre-seed whitelist of 24 colleagues, teasers, and initial draw status
const seedResult = seedDatabase(db);
console.log(`[DB] Database initialized. Seeded ${seedResult.participants} participants & teasers.`);

// 3. Periodic Background Garbage Collection (Sessions & Challenges)
const q = createQueryLayer(db);

function runGarbageCollection(): void {
  try {
    q.cleanExpiredSessions();
    q.cleanExpiredChallenges();
  } catch (err) {
    console.error('[GC] Error running background garbage collection:', err);
  }
}

runGarbageCollection();
const GC_INTERVAL_MS = 15 * 60 * 1000;
const gcTimer = setInterval(runGarbageCollection, GC_INTERVAL_MS);
if (gcTimer.unref) {
  gcTimer.unref();
}

// 3b. Periodic Push Notification Dispatcher (debounced wishlist updates & 3-day party reminder)
const PUSH_CHECK_INTERVAL_MS = 60 * 1000;
const pushTimer = setInterval(() => {
  processPendingPushNotifications().catch((err) => {
    console.error('[Push] Error processing pending push notifications:', err);
  });
}, PUSH_CHECK_INTERVAL_MS);
if (pushTimer.unref) {
  pushTimer.unref();
}

// 4. Create & Start Express Server
const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[Server] Wichteln 24 Kollegen API running on http://localhost:${config.port}`);
  console.log(`[Server] Mode: ${config.nodeEnv} | RP ID: ${config.rpID}`);
});

function gracefulShutdown(signal: string): void {
  console.log(`[Server] Received ${signal}. Shutting down...`);
  clearInterval(gcTimer);
  clearInterval(pushTimer);
  server.close(() => {
    try {
      db.close();
    } catch (err) {
      console.error('[Server] Error closing database:', err);
    }
    console.log('[Server] Shutdown complete.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
