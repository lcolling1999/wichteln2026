import { Router, Request, Response } from 'express';
import { adminLoginLimiter } from '../middlewares/rateLimit.js';
import { getDatabase, runTransaction } from '../db/database.js';
import { createQueryLayer } from '../db/queries.js';

export const testRouter = Router();

/**
 * POST /api/test/reset-rate-limit
 * Resets sliding-window rate limit records for automated test suites.
 */
testRouter.post('/reset-rate-limit', (_req: Request, res: Response) => {
  adminLoginLimiter.resetAll();
  res.status(200).json({
    success: true,
    message: 'Rate limits successfully reset',
  });
});

/**
 * POST /api/test/reset-draw-state
 * Resets draw status to uncompleted (is_drawn = 0) and clears assignments table.
 */
testRouter.post('/reset-draw-state', (_req: Request, res: Response) => {
  const db = getDatabase();
  const q = createQueryLayer(db);
  q.resetDraw();
  res.status(200).json({
    success: true,
    isDrawn: false,
    message: 'Draw state successfully reset to initial pre-draw state',
  });
});

/**
 * POST /api/test/reset-all
 * Full teardown and reseed back to pristine 24-participant pre-registration state.
 */
testRouter.post('/reset-all', (_req: Request, res: Response) => {
  const db = getDatabase();
  const q = createQueryLayer(db);

  runTransaction(db, () => {
    q.resetDraw();
    db.prepare('UPDATE participants SET is_registered = 0, registered_at = NULL').run();
    db.prepare('DELETE FROM authenticators').run();
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM webauthn_challenges').run();
  });

  adminLoginLimiter.resetAll();

  res.status(200).json({
    success: true,
    message: 'Database and rate limits fully reset',
  });
});
