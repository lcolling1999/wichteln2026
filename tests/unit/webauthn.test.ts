import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { setDatabase } from '../../server/db/database.js';
import { initializeSchema } from '../../server/db/schema.js';
import { seedDatabase } from '../../server/db/seeds.js';
import { createQueryLayer } from '../../server/db/queries.js';
import { webauthnService, WebAuthnError } from '../../server/services/webauthn.service.js';

describe('WebAuthn Service & Challenge Lifecycle Tests', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:', {
      enableForeignKeyConstraints: true,
    });
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    initializeSchema(db);
    seedDatabase(db);
    setDatabase(db);
  });

  describe('Challenge Generation & Lifecycle', () => {
    it('generates registration options and persists challenge with 5-minute TTL', async () => {
      const q = createQueryLayer(db);
      const options = await webauthnService.generateRegistrationOptions(1);

      expect(options).toBeDefined();
      expect(options.challenge).toBeDefined();
      expect(options.rp.name).toBe('Wichteln 24 Kollegen');
      expect(options.user.name).toBe('Lada');

      // Verify challenge row in DB
      const row = db
        .prepare('SELECT * FROM webauthn_challenges WHERE challenge = ?')
        .get(options.challenge) as any;
      expect(row).toBeDefined();
      expect(row.participant_id).toBe(1);
      expect(row.type).toBe('registration');
      expect(row.expires_at).toBeGreaterThan(Date.now() + 4 * 60 * 1000);
      expect(row.expires_at).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1000);
    });

    it('purges previous registration challenge when generating a new one for the same participant', async () => {
      const options1 = await webauthnService.generateRegistrationOptions(1);
      const options2 = await webauthnService.generateRegistrationOptions(1);

      expect(options1.challenge).not.toBe(options2.challenge);

      const oldRow = db
        .prepare('SELECT * FROM webauthn_challenges WHERE challenge = ?')
        .get(options1.challenge);
      const newRow = db
        .prepare('SELECT * FROM webauthn_challenges WHERE challenge = ?')
        .get(options2.challenge);

      expect(oldRow).toBeUndefined();
      expect(newRow).toBeDefined();
    });

    it('generates authentication options with challenge', async () => {
      const options = await webauthnService.generateAuthenticationOptions(1);
      expect(options).toBeDefined();
      expect(options.challenge).toBeDefined();

      const row = db
        .prepare('SELECT * FROM webauthn_challenges WHERE challenge = ?')
        .get(options.challenge) as any;
      expect(row).toBeDefined();
      expect(row.type).toBe('authentication');
    });
  });

  describe('Anti-Hijacking Checks', () => {
    it('rejects registration options with 409 Conflict if participant is already registered', async () => {
      const q = createQueryLayer(db);
      q.setParticipantRegistered(1);

      await expect(webauthnService.generateRegistrationOptions(1)).rejects.toThrow(
        WebAuthnError
      );

      try {
        await webauthnService.generateRegistrationOptions(1);
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('ALREADY_REGISTERED');
      }
    });

    it('rejects registration options with 404 if participant does not exist', async () => {
      await expect(webauthnService.generateRegistrationOptions(999)).rejects.toThrow(
        WebAuthnError
      );

      try {
        await webauthnService.generateRegistrationOptions(999);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('PARTICIPANT_NOT_FOUND');
      }
    });

    it('rejects registration verification with 409 Conflict if participant is already registered', async () => {
      const q = createQueryLayer(db);
      q.setParticipantRegistered(1);

      const mockPayload: any = {
        id: 'mock-id',
        rawId: 'mock-id',
        response: {
          clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: 'test' })).toString('base64url'),
          attestationObject: 'mock',
        },
        type: 'public-key',
      };

      await expect(webauthnService.verifyRegistration(1, mockPayload)).rejects.toMatchObject({
        statusCode: 409,
        code: 'ALREADY_REGISTERED',
      });
    });

    it('rejects registration verification with 400 if challenge is missing for unregistered participant', async () => {
      const mockPayload: any = {
        id: 'mock-id',
        rawId: 'mock-id',
        response: {
          clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: 'test' })).toString('base64url'),
          attestationObject: 'mock',
        },
        type: 'public-key',
      };

      // Participant 2 is unregistered and has no challenge
      await expect(webauthnService.verifyRegistration(2, mockPayload)).rejects.toMatchObject({
        statusCode: 400,
        code: 'CHALLENGE_NOT_FOUND',
      });
    });
  });

  describe('Single-Use Consumption & Expiration', () => {
    it('consumes and deletes challenge upon retrieval so it cannot be reused', () => {
      const q = createQueryLayer(db);
      q.saveChallenge({
        challenge: 'test-challenge-abc',
        participant_id: 1,
        type: 'registration',
      });

      const firstRetrieval = q.getAndConsumeRegistrationChallenge(1);
      expect(firstRetrieval).toBeDefined();
      expect(firstRetrieval?.challenge).toBe('test-challenge-abc');

      // Second retrieval must return null because challenge was deleted
      const secondRetrieval = q.getAndConsumeRegistrationChallenge(1);
      expect(secondRetrieval).toBeNull();
    });

    it('returns null and purges expired challenges', () => {
      const q = createQueryLayer(db);
      q.saveChallenge({
        challenge: 'expired-challenge-xyz',
        participant_id: 2,
        type: 'registration',
        ttlMs: -1000, // already expired
      });

      const retrieval = q.getAndConsumeRegistrationChallenge(2);
      expect(retrieval).toBeNull();
    });
  });

  describe('Session Creation and Lookup', () => {
    it('creates secure 32-byte hex session tokens and associates participant profile', () => {
      const q = createQueryLayer(db);
      const token = webauthnService.createSession(1, false);

      expect(token).toMatch(/^[a-f0-9]{64}$/);

      const session = q.getSession(token);
      expect(session).toBeDefined();
      expect(session?.participant_id).toBe(1);
      expect(session?.name).toBe('Lada');
      expect(session?.is_admin).toBe(0);
    });

    it('creates admin session without participant_id and with is_admin=1', () => {
      const q = createQueryLayer(db);
      const token = webauthnService.createSession(null, true);

      const session = q.getSession(token);
      expect(session).toBeDefined();
      expect(session?.participant_id).toBeNull();
      expect(session?.is_admin).toBe(1);
    });
  });
});
