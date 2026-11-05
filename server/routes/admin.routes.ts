import { Router, Request, Response, NextFunction } from 'express';
import { adminService, verifyAdminPin } from '../services/admin.service.js';
import { adminRateLimitMiddleware, adminLoginLimiter } from '../middlewares/rateLimit.js';
import { requireAdmin, ADMIN_COOKIE } from '../middlewares/auth.middleware.js';
import { webauthnService } from '../services/webauthn.service.js';
import { config } from '../config.js';

export const adminRouter = Router();

const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Admin sessions use their own cookie so that they never overwrite the participant's
 * passkey session (otherwise the organiser would be logged out as colleague after the draw).
 */
function setAdminCookie(res: Response, token: string): void {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_MS,
  });
}

/**
 * POST /api/admin/login
 * Constant-time PIN verification with sliding-window rate limiting
 */
adminRouter.post(
  '/login',
  adminRateLimitMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pin } = req.body;
      const ip = req.ip || req.socket.remoteAddress || 'unknown';

      if (typeof pin !== 'string' || !verifyAdminPin(pin)) {
        adminLoginLimiter.recordFailure(ip);
        res.status(401).json({
          error: 'Administrator-PIN ungültig.',
          code: 'INVALID_PIN',
        });
        return;
      }

      // Reset rate limit attempts on success
      adminLoginLimiter.reset(ip);

      // Create admin session (separate cookie, keeps participant login intact)
      const token = webauthnService.createSession(null, true);
      setAdminCookie(res, token);

      res.status(200).json({
        success: true,
        isAdmin: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/admin/overview
 * Overview of colleagues, teasers, and draw state
 */
adminRouter.get('/overview', requireAdmin, (req: Request, res: Response, next: NextFunction) => {
  try {
    const overview = adminService.getOverview();
    res.status(200).json(overview);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/draw
 * Atomic trigger for 24-colleague single-cycle derangement
 */
adminRouter.post('/draw', requireAdmin, (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = adminService.executeDraw(req.user!.adminSessionId ?? req.user!.sessionId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/teasers/:participantId
 * Updates teaser sentence and keywords
 */
adminRouter.put(
  '/teasers/:participantId',
  requireAdmin,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const participantId = Number(req.params.participantId);
      if (isNaN(participantId) || participantId <= 0) {
        res.status(400).json({
          error: 'Valide participantId ist erforderlich.',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const { sentence, keywords } = req.body;
      if (typeof sentence !== 'string' || !Array.isArray(keywords)) {
        res.status(400).json({
          error: 'sentence (string) und keywords (array) sind erforderlich.',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const result = adminService.updateTeaser(participantId, sentence, keywords);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/admin/reset-participant
 * Resets a colleague's passkey and registration before draw
 */
adminRouter.post(
  '/reset-participant',
  requireAdmin,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { participantId } = req.body;
      if (typeof participantId !== 'number' || participantId <= 0) {
        res.status(400).json({
          error: 'Valide participantId ist erforderlich.',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const result = adminService.resetParticipant(participantId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/admin/reset-rate-limit
 * Test and non-production helper to clear rate limiter records.
 */
if (!config.isProduction) {
  adminRouter.post('/reset-rate-limit', (_req: Request, res: Response) => {
    adminLoginLimiter.resetAll();
    res.status(200).json({ success: true, message: 'Admin login rate limiter reset' });
  });
}

