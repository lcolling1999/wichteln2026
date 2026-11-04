import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { runTransaction } from './database.js';

export interface Participant {
  id: number;
  name: string;
  display_name: string;
  normalized_name: string;
  is_registered: number; // 0 or 1
  registered_at: string | null;
  created_at: string;
}

export interface Authenticator {
  id: string;
  participant_id: number;
  public_key: Uint8Array;
  counter: number;
  transports: string | null;
  device_type: string | null;
  backed_up: number; // 0 or 1
  created_at: string;
  last_used_at: string | null;
}

export interface DrawStatus {
  id: number;
  is_drawn: number; // 0 or 1
  drawn_at: string | null;
  drawn_by_admin: string | null;
  verification_hash: string | null;
}

export interface Assignment {
  id: number;
  giver_id: number;
  receiver_id: number;
  created_at: string;
}

export interface TeaserSentence {
  id: number;
  participant_id: number;
  sentence: string;
  keywords_json: string;
  updated_at: string;
}

export interface WishList {
  id: number;
  participant_id: number;
  content: string;
  updated_at: string;
}

export interface Session {
  id: string;
  participant_id: number | null;
  is_admin: number; // 0 or 1
  expires_at: string;
  created_at: string;
}

export interface WebAuthnChallenge {
  challenge: string;
  participant_id: number | null;
  type: 'registration' | 'authentication';
  expires_at: number;
  created_at: string;
}

export function createQueryLayer(db: DatabaseSync) {
  // Prepared statements cache
  const stmts = {
    // Participants
    getAllParticipants: db.prepare(
      'SELECT * FROM participants ORDER BY name ASC'
    ),
    getParticipantById: db.prepare(
      'SELECT * FROM participants WHERE id = ?'
    ),
    getParticipantByNormalizedName: db.prepare(
      'SELECT * FROM participants WHERE normalized_name = ?'
    ),
    getRegisteredParticipants: db.prepare(
      'SELECT * FROM participants WHERE is_registered = 1 ORDER BY name ASC'
    ),
    getRegisteredCount: db.prepare(
      'SELECT COUNT(*) as count FROM participants WHERE is_registered = 1'
    ),
    setParticipantRegistered: db.prepare(
      "UPDATE participants SET is_registered = 1, registered_at = ? WHERE id = ?"
    ),
    resetParticipant: db.prepare(
      'UPDATE participants SET is_registered = 0, registered_at = NULL WHERE id = ?'
    ),

    // Authenticators
    getAuthenticatorById: db.prepare(
      'SELECT * FROM authenticators WHERE id = ?'
    ),
    getAuthenticatorsByParticipantId: db.prepare(
      'SELECT * FROM authenticators WHERE participant_id = ? ORDER BY created_at DESC'
    ),
    insertAuthenticator: db.prepare(`
      INSERT INTO authenticators (id, participant_id, public_key, counter, transports, device_type, backed_up)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateAuthenticatorCounter: db.prepare(
      "UPDATE authenticators SET counter = ?, last_used_at = datetime('now') WHERE id = ?"
    ),
    deleteAuthenticatorsByParticipantId: db.prepare(
      'DELETE FROM authenticators WHERE participant_id = ?'
    ),

    // Draw Status
    getDrawStatus: db.prepare(
      'SELECT * FROM draw_status WHERE id = 1'
    ),
    updateDrawStatus: db.prepare(`
      UPDATE draw_status 
      SET is_drawn = 1, drawn_at = ?, drawn_by_admin = ?, verification_hash = ?
      WHERE id = 1
    `),
    resetDrawStatus: db.prepare(`
      UPDATE draw_status 
      SET is_drawn = 0, drawn_at = NULL, drawn_by_admin = NULL, verification_hash = NULL 
      WHERE id = 1
    `),

    // Assignments
    getAssignmentByGiverId: db.prepare(
      'SELECT * FROM assignments WHERE giver_id = ?'
    ),
    getAssignmentDetailByGiverId: db.prepare(`
      SELECT 
        p.id AS partnerId,
        p.name AS partnerName,
        t.sentence AS sentence,
        t.keywords_json AS keywords_json
      FROM assignments a
      JOIN participants p ON a.receiver_id = p.id
      JOIN teaser_sentences t ON p.id = t.participant_id
      WHERE a.giver_id = ?
    `),
    getAllAssignmentsWithNames: db.prepare(`
      SELECT 
        g.id AS giverId, g.name AS giverName,
        r.id AS receiverId, r.name AS receiverName
      FROM assignments a
      JOIN participants g ON a.giver_id = g.id
      JOIN participants r ON a.receiver_id = r.id
      ORDER BY g.name ASC
    `),
    insertAssignment: db.prepare(
      'INSERT INTO assignments (giver_id, receiver_id) VALUES (?, ?)'
    ),
    clearAssignments: db.prepare(
      'DELETE FROM assignments'
    ),

    // Teaser Sentences
    getTeaserByParticipantId: db.prepare(
      'SELECT * FROM teaser_sentences WHERE participant_id = ?'
    ),
    getAllTeasers: db.prepare(`
      SELECT t.*, p.name as participantName
      FROM teaser_sentences t
      JOIN participants p ON t.participant_id = p.id
      ORDER BY p.name ASC
    `),
    updateTeaser: db.prepare(`
      UPDATE teaser_sentences
      SET sentence = ?, keywords_json = ?, updated_at = datetime('now')
      WHERE participant_id = ?
    `),

    // Wish Lists
    getWishListByParticipantId: db.prepare(
      'SELECT * FROM wish_lists WHERE participant_id = ?'
    ),
    upsertWishList: db.prepare(`
      INSERT INTO wish_lists (participant_id, content)
      VALUES (?, ?)
      ON CONFLICT(participant_id) DO UPDATE SET
        content = excluded.content,
        updated_at = datetime('now')
    `),
    getPartnerWishListByGiverId: db.prepare(`
      SELECT p.name AS partnerName, w.content AS content
      FROM assignments a
      JOIN participants p ON a.receiver_id = p.id
      JOIN wish_lists w ON p.id = w.participant_id
      WHERE a.giver_id = ?
    `),

    // Sessions
    getSessionWithParticipant: db.prepare(`
      SELECT s.id, s.participant_id, s.is_admin, s.expires_at, s.created_at,
             p.name, p.display_name
      FROM sessions s
      LEFT JOIN participants p ON s.participant_id = p.id
      WHERE s.id = ?
    `),
    insertSession: db.prepare(
      'INSERT INTO sessions (id, participant_id, is_admin, expires_at) VALUES (?, ?, ?, ?)'
    ),
    deleteSession: db.prepare(
      'DELETE FROM sessions WHERE id = ?'
    ),
    deleteExpiredSessions: db.prepare(
      "DELETE FROM sessions WHERE datetime(expires_at) < datetime('now')"
    ),

    // Challenges
    getChallenge: db.prepare(
      'SELECT * FROM webauthn_challenges WHERE challenge = ?'
    ),
    getRegistrationChallengeByParticipant: db.prepare(
      "SELECT * FROM webauthn_challenges WHERE participant_id = ? AND type = 'registration' ORDER BY created_at DESC LIMIT 1"
    ),
    insertChallenge: db.prepare(
      'INSERT INTO webauthn_challenges (challenge, participant_id, type, expires_at) VALUES (?, ?, ?, ?)'
    ),
    deleteChallenge: db.prepare(
      'DELETE FROM webauthn_challenges WHERE challenge = ?'
    ),
    deleteChallengesByParticipantAndType: db.prepare(
      'DELETE FROM webauthn_challenges WHERE participant_id = ? AND type = ?'
    ),
    deleteExpiredChallenges: db.prepare(
      'DELETE FROM webauthn_challenges WHERE expires_at < ?'
    ),
  };

  return {
    // Participants
    getAllParticipants(): Participant[] {
      return stmts.getAllParticipants.all() as unknown as Participant[];
    },
    getParticipantById(id: number): Participant | null {
      return (stmts.getParticipantById.get(id) as unknown as Participant) || null;
    },
    findParticipantByName(rawName: string): Participant | null {
      const normalized = rawName.trim().normalize('NFC').toLowerCase();
      return (stmts.getParticipantByNormalizedName.get(normalized) as unknown as Participant) || null;
    },
    getRegisteredParticipants(): Participant[] {
      return stmts.getRegisteredParticipants.all() as unknown as Participant[];
    },
    getRegisteredCount(): number {
      const row = stmts.getRegisteredCount.get() as unknown as { count: number };
      return row ? row.count : 0;
    },
    setParticipantRegistered(id: number, registeredAt?: string): void {
      const timestamp = registeredAt ?? new Date().toISOString();
      stmts.setParticipantRegistered.run(timestamp, id);
    },
    resetParticipant(participantId: number): void {
      runTransaction(db, () => {
        stmts.deleteAuthenticatorsByParticipantId.run(participantId);
        stmts.resetParticipant.run(participantId);
      });
    },

    // Authenticators
    getAuthenticatorById(id: string): Authenticator | null {
      return (stmts.getAuthenticatorById.get(id) as unknown as Authenticator) || null;
    },
    getAuthenticatorsByParticipantId(participantId: number): Authenticator[] {
      return stmts.getAuthenticatorsByParticipantId.all(participantId) as unknown as Authenticator[];
    },
    createAuthenticator(data: {
      id: string;
      participant_id: number;
      public_key: Uint8Array | Buffer;
      counter: number;
      transports?: string[];
      device_type?: string;
      backed_up?: boolean;
    }): void {
      stmts.insertAuthenticator.run(
        data.id,
        data.participant_id,
        data.public_key,
        data.counter,
        data.transports ? JSON.stringify(data.transports) : '[]',
        data.device_type ?? 'singleDevice',
        data.backed_up ? 1 : 0
      );
    },
    updateAuthenticatorCounter(id: string, counter: number): void {
      stmts.updateAuthenticatorCounter.run(counter, id);
    },

    // Draw Status
    getDrawStatus(): DrawStatus {
      const row = stmts.getDrawStatus.get() as unknown as DrawStatus;
      return (
        row ?? {
          id: 1,
          is_drawn: 0,
          drawn_at: null,
          drawn_by_admin: null,
          verification_hash: null,
        }
      );
    },
    setDrawStatus(data: { drawnAt: string; drawnByAdmin: string; verificationHash: string }): void {
      stmts.updateDrawStatus.run(data.drawnAt, data.drawnByAdmin, data.verificationHash);
    },
    resetDraw(): void {
      runTransaction(db, () => {
        stmts.clearAssignments.run();
        stmts.resetDrawStatus.run();
      });
    },

    // Assignments
    getAssignmentForGiver(giverId: number): {
      partnerId: number;
      partnerName: string;
      sentence: string;
      keywords_json: string;
    } | null {
      const row = stmts.getAssignmentDetailByGiverId.get(giverId) as unknown as {
        partnerId: number;
        partnerName: string;
        sentence: string;
        keywords_json: string;
      };
      return row || null;
    },
    getAllAssignmentsWithNames(): Array<{
      giverId: number;
      giverName: string;
      receiverId: number;
      receiverName: string;
    }> {
      return stmts.getAllAssignmentsWithNames.all() as unknown as Array<{
        giverId: number;
        giverName: string;
        receiverId: number;
        receiverName: string;
      }>;
    },
    saveDrawAssignments(
      pairs: Array<{ giver_id: number; receiver_id: number }>,
      meta: { adminSessionId: string; verificationHash: string; drawnAt: string }
    ): void {
      runTransaction(db, () => {
        stmts.clearAssignments.run();
        for (const pair of pairs) {
          stmts.insertAssignment.run(pair.giver_id, pair.receiver_id);
        }
        stmts.updateDrawStatus.run(meta.drawnAt, meta.adminSessionId, meta.verificationHash);
      });
    },

    // Teasers
    getTeaserByParticipantId(participantId: number): TeaserSentence | null {
      return (stmts.getTeaserByParticipantId.get(participantId) as unknown as TeaserSentence) || null;
    },
    getAllTeasers(): Array<TeaserSentence & { participantName: string }> {
      return stmts.getAllTeasers.all() as unknown as Array<TeaserSentence & { participantName: string }>;
    },
    updateTeaser(participantId: number, sentence: string, keywords: Array<{ word: string; emoji: string }>): void {
      stmts.updateTeaser.run(sentence, JSON.stringify(keywords), participantId);
    },

    // Wish Lists
    getWishList(participantId: number): WishList | null {
      return (stmts.getWishListByParticipantId.get(participantId) as unknown as WishList) || null;
    },
    upsertWishList(participantId: number, content: string): void {
      stmts.upsertWishList.run(participantId, content);
    },
    getPartnerWishList(giverId: number): { partnerName: string; content: string } | null {
      return (
        (stmts.getPartnerWishListByGiverId.get(giverId) as unknown as { partnerName: string; content: string }) ||
        null
      );
    },

    // Sessions
    createSession(participantId: number | null, isAdmin: boolean, ttlDays = 30): string {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
      stmts.insertSession.run(token, participantId, isAdmin ? 1 : 0, expiresAt);
      return token;
    },
    getSession(token: string): (Session & { name?: string; display_name?: string }) | null {
      const session = stmts.getSessionWithParticipant.get(token) as unknown as
        | (Session & { name?: string; display_name?: string })
        | undefined;
      if (!session) return null;
      if (new Date(session.expires_at).getTime() < Date.now()) {
        stmts.deleteSession.run(token);
        return null;
      }
      return session;
    },
    deleteSession(token: string): void {
      stmts.deleteSession.run(token);
    },
    cleanExpiredSessions(): void {
      stmts.deleteExpiredSessions.run();
    },

    // WebAuthn Challenges
    saveChallenge(data: {
      challenge: string;
      participant_id: number | null;
      type: 'registration' | 'authentication';
      ttlMs?: number;
    }): void {
      const expiresAt = Date.now() + (data.ttlMs ?? 5 * 60 * 1000);
      stmts.insertChallenge.run(data.challenge, data.participant_id, data.type, expiresAt);
    },
    deleteChallengesByParticipantAndType(participantId: number, type: 'registration' | 'authentication'): void {
      stmts.deleteChallengesByParticipantAndType.run(participantId, type);
    },
    getAndConsumeRegistrationChallenge(participantId: number): WebAuthnChallenge | null {
      const challenge = stmts.getRegistrationChallengeByParticipant.get(participantId) as unknown as
        | WebAuthnChallenge
        | undefined;
      if (!challenge) return null;
      stmts.deleteChallenge.run(challenge.challenge);
      if (challenge.expires_at < Date.now()) return null;
      return challenge;
    },
    getAndConsumeAuthChallenge(challengeStr: string): WebAuthnChallenge | null {
      const challenge = stmts.getChallenge.get(challengeStr) as unknown as WebAuthnChallenge | undefined;
      if (!challenge) return null;
      stmts.deleteChallenge.run(challengeStr);
      if (challenge.expires_at < Date.now()) return null;
      return challenge;
    },
    cleanExpiredChallenges(): void {
      stmts.deleteExpiredChallenges.run(Date.now());
    },
  };
}

export type QueryLayer = ReturnType<typeof createQueryLayer>;
