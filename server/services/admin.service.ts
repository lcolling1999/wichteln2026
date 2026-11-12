import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDatabase, runTransaction } from '../db/database.js';
import { createQueryLayer } from '../db/queries.js';
import { generateSingleCycleDerangement } from './derangement.service.js';
import { sendDrawCompleteNotifications } from './push.service.js';

export class AdminError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AdminError';
  }
}

/**
 * Constant-time PIN verification using pre-hashed SHA-256 buffers.
 * Pre-hashing guarantees identical 32-byte buffer lengths, preventing
 * timing attacks as well as RangeError exceptions in crypto.timingSafeEqual.
 */
export function verifyAdminPin(submittedPin: string): boolean {
  const expectedPin = config.adminPin;
  if (typeof submittedPin !== 'string' || submittedPin.length === 0) {
    return false;
  }

  const submittedHash = crypto.createHash('sha256').update(submittedPin, 'utf8').digest();
  const expectedHash = crypto.createHash('sha256').update(expectedPin, 'utf8').digest();

  return crypto.timingSafeEqual(submittedHash, expectedHash);
}

export class AdminService {
  /**
   * Executes the Secret Santa draw atomically
   */
  public executeDraw(adminSessionId: string): {
    success: true;
    drawnAt: string;
    verificationHash: string;
    pairCount: number;
  } {
    const db = getDatabase();
    const q = createQueryLayer(db);

    const drawStatus = q.getDrawStatus();
    if (drawStatus.is_drawn === 1) {
      throw new AdminError(409, 'Die Auslosung wurde bereits durchgeführt.', 'ALREADY_DRAWN');
    }

    const registered = q.getRegisteredParticipants();
    const totalParticipants = q.getAllParticipants().length;
    const allowPartial = config.allowPartialDraw;

    if (!allowPartial) {
      if (registered.length !== totalParticipants) {
        throw new AdminError(
          400,
          `Auslosung nicht möglich: Erst ${registered.length} von ${totalParticipants} Kollegen sind registriert.`,
          'REGISTRATIONS_INCOMPLETE',
          { registeredCount: registered.length, requiredCount: totalParticipants }
        );
      }
    } else {
      if (registered.length < 2) {
        throw new AdminError(
          400,
          'Mindestens 2 registrierte Kollegen erforderlich für Auslosung.',
          'REGISTRATIONS_INCOMPLETE',
          { registeredCount: registered.length, requiredCount: 2 }
        );
      }
    }

    const registeredIds = registered.map((p) => p.id);
    const derangement = generateSingleCycleDerangement(registeredIds);
    const drawnAt = new Date().toISOString();

    // Atomic transaction execution
    runTransaction(db, () => {
      // Re-check singleton inside write lock
      const currentStatus = q.getDrawStatus();
      if (currentStatus.is_drawn === 1) {
        throw new AdminError(409, 'Die Auslosung wurde bereits durchgeführt.', 'ALREADY_DRAWN');
      }

      q.saveDrawAssignments(derangement.pairs, {
        adminSessionId,
        verificationHash: derangement.verificationHash,
        drawnAt,
      });
    });

    // Notify all subscribed participants in the background without blocking the admin response
    sendDrawCompleteNotifications().catch((err) => {
      console.error('[Push] Fehler bei Auslosungs-Benachrichtigung:', err);
    });

    return {
      success: true,
      drawnAt,
      verificationHash: derangement.verificationHash,
      pairCount: derangement.pairs.length,
    };
  }

  /**
   * Returns overview for admin dashboard
   */
  public getOverview() {
    const db = getDatabase();
    const q = createQueryLayer(db);

    const drawStatus = q.getDrawStatus();
    const allParticipants = q.getAllParticipants();
    const registeredCount = q.getRegisteredCount();
    const teasers = q.getAllTeasers();

    // If drawn, get assignment names
    const assignmentsMap = new Map<number, string>();
    if (drawStatus.is_drawn === 1) {
      const assignments = q.getAllAssignmentsWithNames();
      for (const a of assignments) {
        assignmentsMap.set(a.giverId, a.receiverName);
      }
    }

    const participantsList = allParticipants.map((p) => {
      const auths = q.getAuthenticatorsByParticipantId(p.id);
      return {
        id: p.id,
        name: p.name,
        displayName: p.display_name,
        isRegistered: Boolean(p.is_registered),
        registeredAt: p.registered_at,
        assignedPartnerName: assignmentsMap.get(p.id) || null,
        hasAuthenticator: auths.length > 0,
      };
    });

    return {
      registeredCount,
      totalParticipants: allParticipants.length,
      isDrawn: Boolean(drawStatus.is_drawn),
      drawnAt: drawStatus.drawn_at,
      verificationHash: drawStatus.verification_hash,
      participants: participantsList,
      teasers: teasers.map((t) => ({
        participantId: t.participant_id,
        participantName: t.participantName,
        sentence: t.sentence,
        keywords: JSON.parse(t.keywords_json || '[]'),
      })),
    };
  }

  /**
   * Updates teaser sentence and keywords
   */
  public updateTeaser(
    participantId: number,
    sentence: string,
    keywords: Array<{ word: string; emoji: string }>
  ) {
    const db = getDatabase();
    const q = createQueryLayer(db);

    const participant = q.getParticipantById(participantId);
    if (!participant) {
      throw new AdminError(404, 'Teilnehmer nicht gefunden.', 'PARTICIPANT_NOT_FOUND');
    }

    q.updateTeaser(participantId, sentence, keywords);
    return { success: true };
  }

  /**
   * Resets participant registration and passkeys so they can register a new passkey
   */
  public resetParticipant(participantId: number) {
    const db = getDatabase();
    const q = createQueryLayer(db);

    const participant = q.getParticipantById(participantId);
    if (!participant) {
      throw new AdminError(404, 'Teilnehmer nicht gefunden.', 'PARTICIPANT_NOT_FOUND');
    }

    q.resetParticipant(participantId);
    return {
      success: true,
      participantId,
      name: participant.display_name || participant.name,
    };
  }
}

export const adminService = new AdminService();
