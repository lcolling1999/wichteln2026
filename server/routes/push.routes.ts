import { Router, Request, Response, NextFunction } from 'express';
import { requireParticipant } from '../middlewares/auth.middleware.js';
import { getDatabase } from '../db/database.js';
import { createQueryLayer } from '../db/queries.js';
import { getVapidPublicKey } from '../services/push.service.js';

export const pushRouter = Router();

/**
 * GET /api/push/vapid-public-key
 * Returns the public VAPID key so the browser can subscribe to Web Push.
 */
pushRouter.get('/vapid-public-key', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const publicKey = await getVapidPublicKey();
    res.status(200).json({
      enabled: Boolean(publicKey),
      publicKey,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/push/subscribe
 * Stores or updates a participant's browser push subscription.
 */
pushRouter.post(
  '/subscribe',
  requireParticipant,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { endpoint, keys } = req.body ?? {};
      if (
        typeof endpoint !== 'string' ||
        !endpoint ||
        typeof keys?.p256dh !== 'string' ||
        !keys.p256dh ||
        typeof keys?.auth !== 'string' ||
        !keys.auth
      ) {
        res.status(400).json({
          error: 'Ungültige Push-Subscription.',
          code: 'INVALID_SUBSCRIPTION',
        });
        return;
      }

      const q = createQueryLayer(getDatabase());
      q.upsertPushSubscription(req.user!.id!, endpoint, keys.p256dh, keys.auth);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/push/subscribe
 * Removes a participant's push subscription.
 */
pushRouter.delete(
  '/subscribe',
  requireParticipant,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { endpoint } = req.body ?? {};
      if (typeof endpoint !== 'string' || !endpoint) {
        res.status(400).json({
          error: 'endpoint ist erforderlich.',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const q = createQueryLayer(getDatabase());
      q.deletePushSubscription(endpoint, req.user!.id!);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);
