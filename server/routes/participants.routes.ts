import { Router, Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/database.js';
import { createQueryLayer } from '../db/queries.js';

export const participantsRouter = Router();

/**
 * GET /api/status
 * Public status endpoint for lobby polling and status banner.
 */
participantsRouter.get('/status', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const q = createQueryLayer(db);

    const drawStatus = q.getDrawStatus();
    const registeredCount = q.getRegisteredCount();

    res.status(200).json({
      isDrawn: Boolean(drawStatus.is_drawn),
      totalParticipants: 24,
      registeredCount,
      drawnAt: drawStatus.drawn_at,
      verificationHash: drawStatus.verification_hash,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/participants
 * Public roster of 24 colleagues for onboarding selector and waiting tree lobby.
 * Strictly sanitized: no public keys, no sessions, no assignment pairings.
 */
participantsRouter.get('/participants', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const q = createQueryLayer(db);

    const participants = q.getAllParticipants();

    const publicList = participants.map((p) => ({
      id: p.id,
      name: p.name,
      displayName: p.display_name,
      isRegistered: Boolean(p.is_registered),
      registeredAt: p.registered_at,
    }));

    res.status(200).json(publicList);
  } catch (err) {
    next(err);
  }
});
