import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/database.js';
import { createQueryLayer } from '../db/queries.js';

export interface RequestUser {
  id: number | null; // null for admin-only session
  name?: string;
  displayName?: string;
  isAdmin: boolean;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

/**
 * Middleware: Parses session token from cookie or Authorization header and attaches req.user
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token =
    req.cookies?.session_token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : null);

  if (!token) {
    return next();
  }

  try {
    const db = getDatabase();
    const q = createQueryLayer(db);
    const session = q.getSession(token);

    if (session) {
      req.user = {
        id: session.participant_id,
        name: session.name,
        displayName: session.display_name,
        isAdmin: Boolean(session.is_admin),
        sessionId: session.id,
      };
    }
  } catch (err) {
    console.error('Session lookup error:', err);
  }

  next();
}

export const sessionMiddleware = authMiddleware;

/**
 * Guard: Requires participant or admin session
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Nicht angemeldet.', code: 'UNAUTHORIZED' });
    return;
  }
  next();
}

/**
 * Guard: Requires participant session (cannot be admin-only)
 */
export function requireParticipant(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.id === null) {
    res.status(401).json({ error: 'Teilnehmer-Sitzung erforderlich.', code: 'PARTICIPANT_REQUIRED' });
    return;
  }
  next();
}

/**
 * Guard: Requires admin session
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !req.user.isAdmin) {
    res.status(403).json({ error: 'Administrator-Rechte erforderlich.', code: 'FORBIDDEN' });
    return;
  }
  next();
}
