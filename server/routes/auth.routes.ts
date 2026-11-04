import { Router, Request, Response, NextFunction } from 'express';
import { webauthnService, WebAuthnError } from '../services/webauthn.service.js';
import { config } from '../config.js';
import { getDatabase } from '../db/database.js';
import { createQueryLayer } from '../db/queries.js';

export const authRouter = Router();

function setSessionCookie(res: Response, token: string): void {
  res.cookie('session_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: config.sessionMaxAgeMs,
  });
}

/**
 * POST /api/auth/register-options
 */
authRouter.post('/register-options', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { participantId } = req.body;
    if (typeof participantId !== 'number' || participantId <= 0) {
      res.status(400).json({ error: 'Valide participantId ist erforderlich.', code: 'INVALID_INPUT' });
      return;
    }

    const options = await webauthnService.generateRegistrationOptions(participantId);
    res.status(200).json(options);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/register-verify
 */
authRouter.post('/register-verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { participantId, response } = req.body;
    if (typeof participantId !== 'number' || !response) {
      res.status(400).json({
        error: 'participantId und response sind erforderlich.',
        code: 'INVALID_INPUT',
      });
      return;
    }

    const result = await webauthnService.verifyRegistration(participantId, response);
    setSessionCookie(res, result.sessionToken);

    res.status(200).json({
      success: true,
      participant: result.participant,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login-options
 */
authRouter.post('/login-options', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { participantId } = req.body;
    const targetId = typeof participantId === 'number' && participantId > 0 ? participantId : undefined;

    const options = await webauthnService.generateAuthenticationOptions(targetId);
    res.status(200).json(options);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login-verify
 */
authRouter.post('/login-verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { response } = req.body;
    if (!response) {
      res.status(400).json({
        error: 'response ist erforderlich.',
        code: 'INVALID_INPUT',
      });
      return;
    }

    const result = await webauthnService.verifyAuthentication(response);
    setSessionCookie(res, result.sessionToken);

    res.status(200).json({
      success: true,
      participant: result.participant,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 */
authRouter.get('/me', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(200).json({
      authenticated: false,
      isAdmin: false,
      participant: null,
    });
    return;
  }

  res.status(200).json({
    authenticated: true,
    isAdmin: req.user.isAdmin,
    participant: req.user.id
      ? {
          id: req.user.id,
          name: req.user.name,
          displayName: req.user.displayName,
        }
      : null,
  });
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', (req: Request, res: Response) => {
  const sessionId = req.user?.sessionId;
  if (sessionId) {
    try {
      const db = getDatabase();
      const q = createQueryLayer(db);
      q.deleteSession(sessionId);
    } catch (err) {
      console.error('Logout error deleting session:', err);
    }
  }

  res.clearCookie('session_token', { path: '/' });
  res.status(200).json({ success: true });
});
