import { Router, Request, Response, NextFunction } from 'express';
import { requireParticipant } from '../middlewares/auth.middleware.js';
import { getDatabase } from '../db/database.js';
import { createQueryLayer } from '../db/queries.js';

export const meRouter = Router();
export const partnerRouter = Router();

// Apply participant authentication to all /api/me routes
meRouter.use(requireParticipant);
partnerRouter.use(requireParticipant);

/**
 * GET /api/me/assignment
 * Zero-Leakage: Only returns the caller's assigned partner and teaser sentence.
 * Before draw: { isDrawn: false }
 * After draw: { isDrawn: true, partner: { id, name }, teaser: { sentence, keywords } }
 */
meRouter.get('/assignment', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const q = createQueryLayer(db);

    const drawStatus = q.getDrawStatus();
    if (drawStatus.is_drawn === 0) {
      res.status(200).json({ isDrawn: false });
      return;
    }

    const assignment = q.getAssignmentForGiver(req.user!.id!);
    if (!assignment) {
      res.status(404).json({
        error: 'Keine Zuweisung für diesen Teilnehmer gefunden.',
        code: 'ASSIGNMENT_NOT_FOUND',
      });
      return;
    }

    let parsedKeywords: Array<{ word: string; emoji: string }> = [];
    try {
      parsedKeywords = JSON.parse(assignment.keywords_json || '[]');
    } catch {
      parsedKeywords = [];
    }

    res.status(200).json({
      isDrawn: true,
      partner: {
        id: assignment.partnerId,
        name: assignment.partnerName,
      },
      teaser: {
        sentence: assignment.sentence,
        keywords: parsedKeywords,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/me/wishlist
 * Returns caller's own wishlist
 */
meRouter.get('/wishlist', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const q = createQueryLayer(db);

    const wishlist = q.getWishList(req.user!.id!);
    res.status(200).json({
      content: wishlist ? wishlist.content : '',
      updatedAt: wishlist ? wishlist.updated_at : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/me/wishlist
 * Updates caller's own wishlist (max 2000 chars)
 */
meRouter.put('/wishlist', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') {
      res.status(400).json({
        error: 'content als String ist erforderlich.',
        code: 'INVALID_INPUT',
      });
      return;
    }

    if (content.length > 2000) {
      res.status(400).json({
        error: 'Wunschzettel darf maximal 2000 Zeichen lang sein.',
        code: 'CONTENT_TOO_LONG',
      });
      return;
    }

    const db = getDatabase();
    const q = createQueryLayer(db);
    const trimmed = content.trim();
    const previous = q.getWishList(req.user!.id!)?.content ?? '';

    q.upsertWishList(req.user!.id!, trimmed);

    // Debounce partner notification (10 min after last edit) so autosave bursts only trigger 1 push
    if (trimmed !== previous && q.getDrawStatus().is_drawn === 1) {
      if (trimmed.length > 0) {
        q.scheduleWishlistPush(req.user!.id!, 10);
      } else {
        q.clearWishlistPush(req.user!.id!);
      }
    }

    res.status(200).json({
      success: true,
      content: trimmed,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Shared handler for partner wishlist retrieval
 */
function handlePartnerWishlist(req: Request, res: Response, next: NextFunction): void {
  try {
    const db = getDatabase();
    const q = createQueryLayer(db);

    const drawStatus = q.getDrawStatus();
    if (drawStatus.is_drawn === 0) {
      res.status(400).json({
        error: 'Die Auslosung hat noch nicht stattgefunden.',
        code: 'NOT_DRAWN_YET',
      });
      return;
    }

    const partnerWish = q.getPartnerWishList(req.user!.id!);
    if (!partnerWish) {
      res.status(404).json({
        error: 'Kein Partner oder Wunschzettel gefunden.',
        code: 'PARTNER_WISHLIST_NOT_FOUND',
      });
      return;
    }

    res.status(200).json({
      partnerName: partnerWish.partnerName,
      content: partnerWish.content,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/partner/wishlist
 */
partnerRouter.get('/wishlist', handlePartnerWishlist);

/**
 * Alias GET /api/me/partner-wishlist for frontend convenience
 */
meRouter.get('/partner-wishlist', handlePartnerWishlist);

/** Within this window a partner counts as "gerade online" */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const ACTIVITY_TIMEZONE = 'Europe/Berlin';

/** Calendar day (YYYY-MM-DD) in the office timezone */
function calendarDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ACTIVITY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export type ActivityBucket = 'online' | 'today' | 'yesterday' | 'days' | 'never';

/**
 * Reduces an exact timestamp to a coarse bucket, so the API never exposes exact
 * activity times of colleagues (privacy by design).
 */
export function toActivityBucket(
  lastActiveAt: string | null,
  now: Date = new Date()
): { status: ActivityBucket; daysAgo?: number } {
  if (!lastActiveAt) return { status: 'never' };
  // SQLite datetime('now') is UTC without zone marker: "YYYY-MM-DD HH:MM:SS"
  const last = new Date(lastActiveAt.replace(' ', 'T') + 'Z');
  if (Number.isNaN(last.getTime())) return { status: 'never' };

  if (now.getTime() - last.getTime() <= ONLINE_WINDOW_MS) return { status: 'online' };

  const dayDiff = Math.round(
    (Date.parse(calendarDay(now)) - Date.parse(calendarDay(last))) / (24 * 60 * 60 * 1000)
  );
  if (dayDiff <= 0) return { status: 'today' };
  if (dayDiff === 1) return { status: 'yesterday' };
  return { status: 'days', daysAgo: dayDiff };
}

/**
 * GET /api/partner/activity
 * Coarse "last active" indicator of the caller's own assigned partner only.
 */
partnerRouter.get('/activity', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const q = createQueryLayer(db);

    if (q.getDrawStatus().is_drawn === 0) {
      res.status(400).json({
        error: 'Die Auslosung hat noch nicht stattgefunden.',
        code: 'NOT_DRAWN_YET',
      });
      return;
    }

    const partner = q.getPartnerLastActive(req.user!.id!);
    if (!partner) {
      res.status(404).json({ error: 'Kein Partner gefunden.', code: 'ASSIGNMENT_NOT_FOUND' });
      return;
    }

    res.status(200).json(toActivityBucket(partner.lastActiveAt));
  } catch (err) {
    next(err);
  }
});
