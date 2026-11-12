import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/database.js';
import { createQueryLayer } from '../db/queries.js';

export const PARTICIPANT_COOKIE = 'session_token';
export const ADMIN_COOKIE = 'admin_token';

export interface RequestUser {
  id: number | null; // null for admin-only session
  name?: string;
  displayName?: string;
  isAdmin: boolean;
  sessionId: string;
  /** Session id of the participant (passkey) session, if any. */
  participantSessionId?: string;
  /** Session id of the admin (PIN) session, if any. */
  adminSessionId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

/**
 * Middleware: Parses session tokens from the participant cookie, the separate admin cookie
 * or the Authorization header and attaches a merged req.user.
 *
 * Participant (passkey) and admin (PIN) sessions live in separate cookies so that opening the
 * admin area never overwrites the participant's own login.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const tokens: string[] = [];
  const participantCookie = req.cookies?.[PARTICIPANT_COOKIE];
  const adminCookie = req.cookies?.[ADMIN_COOKIE];
  if (typeof participantCookie === 'string' && participantCookie) tokens.push(participantCookie);
  if (typeof adminCookie === 'string' && adminCookie) tokens.push(adminCookie);
  if (req.headers.authorization?.startsWith('Bearer ')) {
    const bearer = req.headers.authorization.slice(7).trim();
    if (bearer) tokens.push(bearer);
  }

  if (tokens.length === 0) {
    return next();
  }

  try {
    const db = getDatabase();
    const q = createQueryLayer(db);

    let user: RequestUser | undefined;
    for (const token of tokens) {
      const session = q.getSession(token);
      if (!session) continue;

      if (!user) {
        user = { id: null, isAdmin: false, sessionId: session.id };
      }

      if (session.participant_id !== null && user.id === null) {
        user.id = session.participant_id;
        user.name = session.name;
        user.displayName = session.display_name;
        user.participantSessionId = session.id;
        user.sessionId = session.id;
      }

      if (session.is_admin) {
        user.isAdmin = true;
        user.adminSessionId = session.id;
        if (user.id === null) {
          user.sessionId = session.id;
        }
      }
    }

    if (user) {
      req.user = user;
      if (user.id !== null) {
        try {
          q.touchParticipantActivity(user.id);
        } catch (err) {
          // Activity tracking must never break a request
          console.error('Activity tracking error:', err);
        }
      }
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
