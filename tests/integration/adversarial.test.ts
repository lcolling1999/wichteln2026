import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

vi.mock('@simplewebauthn/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simplewebauthn/server')>();
  return {
    ...actual,
    verifyRegistrationResponse: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
  };
});

import { setDatabase } from '../../server/db/database.js';
import { initializeSchema } from '../../server/db/schema.js';
import { seedDatabase } from '../../server/db/seeds.js';
import { createQueryLayer } from '../../server/db/queries.js';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { adminLoginLimiter } from '../../server/middlewares/rateLimit.js';

describe('Adversarial Backend API & Concurrency Stress Tests', () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    // Reset rate limiter IP table for test isolation
    adminLoginLimiter.reset('::ffff:127.0.0.1');
    adminLoginLimiter.reset('127.0.0.1');
    adminLoginLimiter.reset('unknown');
    adminLoginLimiter.reset('192.168.1.100');
    adminLoginLimiter.reset('192.168.1.101');

    // Fresh in-memory database
    db = new DatabaseSync(':memory:', {
      enableForeignKeyConstraints: true,
    });
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    initializeSchema(db);
    seedDatabase(db);
    setDatabase(db);

    // Reset allowPartialDraw to default false
    config.allowPartialDraw = false;

    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper to generate a valid WebAuthn Registration response structure
   */
  function buildClientRegistrationResponse(challenge: string, credId = 'cred-test-123') {
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge,
        origin: 'http://localhost:5173',
      })
    ).toString('base64url');

    return {
      id: credId,
      rawId: credId,
      response: {
        clientDataJSON,
        attestationObject: 'mockAttestation',
      },
      type: 'public-key' as const,
      clientExtensionResults: {},
    };
  }

  /**
   * Helper to generate a valid WebAuthn Authentication response structure
   */
  function buildClientAuthenticationResponse(challenge: string, credId = 'cred-test-123') {
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge,
        origin: 'http://localhost:5173',
      })
    ).toString('base64url');

    return {
      id: credId,
      rawId: credId,
      response: {
        clientDataJSON,
        authenticatorData: 'mockAuthData',
        signature: 'mockSignature',
      },
      type: 'public-key' as const,
      clientExtensionResults: {},
    };
  }

  // =========================================================================
  // 1. Concurrent Registration Race Condition
  // =========================================================================
  describe('1. Concurrent Registration Race Condition', () => {
    it('handles simultaneous registration attempts for the same colleague', async () => {
      // Mock verifyRegistrationResponse to return verified
      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-participant-1',
            publicKey: new Uint8Array([1, 2, 3, 4, 5]),
            counter: 0,
            transports: ['internal'],
          },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      } as any);

      // Generate challenge for participant 1
      const optRes = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId: 1 });
      expect(optRes.status).toBe(200);
      const challenge = optRes.body.challenge;
      expect(challenge).toBeDefined();

      const regPayload = {
        participantId: 1,
        response: buildClientRegistrationResponse(challenge, 'cred-participant-1'),
      };

      // Fire two concurrent registration verify requests
      const [resA, resB] = await Promise.all([
        request(app).post('/api/auth/register-verify').send(regPayload),
        request(app).post('/api/auth/register-verify').send(regPayload),
      ]);

      const statuses = [resA.status, resB.status];
      console.log('Concurrent registration statuses:', statuses);
      console.log('resA body:', resA.body);
      console.log('resB body:', resB.body);

      // Exactly one must succeed (200) and the other must return 409 Conflict (ALREADY_REGISTERED)
      expect(statuses.sort()).toEqual([200, 409]);
      const losingStatus = statuses.find((s) => s !== 200);
      expect(losingStatus).toBe(409);

      // Participant is now registered in DB
      const q = createQueryLayer(db);
      const p = q.getParticipantById(1);
      expect(p?.is_registered).toBe(1);

      // Subsequent registration attempt via register-options correctly returns 409 Conflict
      const subsequentOpt = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId: 1 });
      expect(subsequentOpt.status).toBe(409);
      expect(subsequentOpt.body.code).toBe('ALREADY_REGISTERED');

      // Subsequent registration attempt directly via register-verify returns 409 Conflict
      const subsequentVerify = await request(app)
        .post('/api/auth/register-verify')
        .send(regPayload);
      expect(subsequentVerify.status).toBe(409);
      expect(subsequentVerify.body.code).toBe('ALREADY_REGISTERED');
    });
  });

  // =========================================================================
  // 2. Replay Attack on WebAuthn Challenge
  // =========================================================================
  describe('2. Replay Attack on WebAuthn Challenge', () => {
    it('registration challenge replay attack: second attempt must fail (400/401)', async () => {
      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-replay-1',
            publicKey: new Uint8Array([1, 2, 3]),
            counter: 0,
            transports: ['internal'],
          },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      } as any);

      // 1. Get options
      const optRes = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId: 2 });
      expect(optRes.status).toBe(200);
      const challenge = optRes.body.challenge;

      const payload = {
        participantId: 2,
        response: buildClientRegistrationResponse(challenge, 'cred-replay-1'),
      };

      // First attempt succeeds
      const firstAttempt = await request(app)
        .post('/api/auth/register-verify')
        .send(payload);
      expect(firstAttempt.status).toBe(200);
      expect(firstAttempt.body.success).toBe(true);

      // Replay attempt using identical payload and consumed challenge
      const replayAttempt = await request(app)
        .post('/api/auth/register-verify')
        .send(payload);
      expect([400, 401, 409]).toContain(replayAttempt.status);
      expect(replayAttempt.status).not.toBe(200);
      expect(replayAttempt.body.success).toBeUndefined();
    });

    it('authentication challenge replay attack: second attempt must fail (400/401)', async () => {
      const q = createQueryLayer(db);
      // Setup registered participant with authenticator
      q.setParticipantRegistered(3);
      q.createAuthenticator({
        id: 'cred-auth-replay',
        participant_id: 3,
        public_key: Buffer.from([1, 2, 3]),
        counter: 0,
        transports: '["internal"]',
        device_type: 'singleDevice',
        backed_up: 0,
      });

      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      } as any);

      // Generate login options
      const optRes = await request(app)
        .post('/api/auth/login-options')
        .send({ participantId: 3 });
      expect(optRes.status).toBe(200);
      const challenge = optRes.body.challenge;

      const payload = {
        response: buildClientAuthenticationResponse(challenge, 'cred-auth-replay'),
      };

      // First login succeeds
      const firstLogin = await request(app)
        .post('/api/auth/login-verify')
        .send(payload);
      expect(firstLogin.status).toBe(200);
      expect(firstLogin.body.success).toBe(true);

      // Second login replay with same challenge
      const replayLogin = await request(app)
        .post('/api/auth/login-verify')
        .send(payload);
      expect([400, 401]).toContain(replayLogin.status);
      expect(replayLogin.body.success).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. Brute-Force Admin PIN
  // =========================================================================
  describe('3. Brute-Force Admin PIN Rate Limiting', () => {
    it('10 rapid failed PIN attempts -> rate limiter triggers HTTP 429 after 5 attempts', async () => {
      // Attempts 1 to 5: must return 401 Unauthorized
      for (let i = 1; i <= 5; i++) {
        const res = await request(app)
          .post('/api/admin/login')
          .send({ pin: `wrong-pin-${i}` });
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('INVALID_PIN');
      }

      // Attempts 6 to 10: must trigger HTTP 429 Too Many Requests
      for (let i = 6; i <= 10; i++) {
        const res = await request(app)
          .post('/api/admin/login')
          .send({ pin: `wrong-pin-${i}` });
        expect(res.status).toBe(429);
        expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(res.headers['retry-after']).toBeDefined();
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      }

      // Even the CORRECT pin must now be rejected with 429 while locked
      const correctPinAttempt = await request(app)
        .post('/api/admin/login')
        .send({ pin: config.adminPin });
      expect(correctPinAttempt.status).toBe(429);
      expect(correctPinAttempt.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  // =========================================================================
  // 4. Premature Draw Attempt
  // =========================================================================
  describe('4. Premature Draw Attempt', () => {
    it('attempt draw when only 23 of 24 colleagues are registered (ALLOW_PARTIAL_DRAW=false) -> must fail (400 Bad Request)', async () => {
      const q = createQueryLayer(db);

      // Register exactly 23 participants (1 through 23), leaving participant 24 unregistered
      for (let id = 1; id <= 23; id++) {
        q.setParticipantRegistered(id);
      }
      expect(q.getRegisteredCount()).toBe(23);

      config.allowPartialDraw = false;

      // Admin login
      const loginRes = await request(app)
        .post('/api/admin/login')
        .send({ pin: config.adminPin });
      expect(loginRes.status).toBe(200);
      const cookie = loginRes.headers['set-cookie'];

      // Attempt draw with only 23 registered
      const drawRes = await request(app)
        .post('/api/admin/draw')
        .set('Cookie', cookie);

      expect(drawRes.status).toBe(400);
      expect(drawRes.body.code).toBe('REGISTRATIONS_INCOMPLETE');
      expect(drawRes.body.details?.registeredCount ?? drawRes.body.registeredCount).toBe(23);
      expect(drawRes.body.details?.requiredCount ?? drawRes.body.requiredCount).toBe(24);

      // Ensure draw status was NOT altered in database
      const status = q.getDrawStatus();
      expect(status.is_drawn).toBe(0);
      expect(status.drawn_at).toBeNull();
      expect(status.verification_hash).toBeNull();

      // Ensure no assignments were created
      const assignments = db.prepare('SELECT COUNT(*) as cnt FROM assignments').get() as { cnt: number };
      expect(assignments.cnt).toBe(0);
    });
  });

  // =========================================================================
  // 5. Duplicate Draw Attempt
  // =========================================================================
  describe('5. Duplicate Draw Attempt', () => {
    it('execute draw twice -> second attempt must fail (409 Conflict)', async () => {
      const q = createQueryLayer(db);

      // Register all 24 participants
      for (let id = 1; id <= 24; id++) {
        q.setParticipantRegistered(id);
      }
      expect(q.getRegisteredCount()).toBe(24);

      // Admin login
      const loginRes = await request(app)
        .post('/api/admin/login')
        .send({ pin: config.adminPin });
      const cookie = loginRes.headers['set-cookie'];

      // First draw attempt: must succeed (200)
      const firstDraw = await request(app)
        .post('/api/admin/draw')
        .set('Cookie', cookie);

      expect(firstDraw.status).toBe(200);
      expect(firstDraw.body.success).toBe(true);
      expect(firstDraw.body.pairCount).toBe(24);
      expect(firstDraw.body.verificationHash).toHaveLength(64);
      const initialHash = firstDraw.body.verificationHash;

      // Second draw attempt: must fail with 409 Conflict
      const secondDraw = await request(app)
        .post('/api/admin/draw')
        .set('Cookie', cookie);

      expect(secondDraw.status).toBe(409);
      expect(secondDraw.body.code).toBe('ALREADY_DRAWN');

      // Verify that database assignments were not changed or duplicated
      const assignmentsCount = db.prepare('SELECT COUNT(*) as cnt FROM assignments').get() as { cnt: number };
      expect(assignmentsCount.cnt).toBe(24);

      const status = q.getDrawStatus();
      expect(status.is_drawn).toBe(1);
      expect(status.verification_hash).toBe(initialHash);
    });
  });

  // =========================================================================
  // 6. Assignment Privacy Probe
  // =========================================================================
  describe('6. Assignment Privacy Probe', () => {
    it('request /api/me/assignment for Participant A and verify response does not leak giver or third-party pairings', async () => {
      const q = createQueryLayer(db);

      // Register all 24 participants and execute draw
      for (let id = 1; id <= 24; id++) {
        q.setParticipantRegistered(id);
      }

      config.allowPartialDraw = false;
      const loginRes = await request(app)
        .post('/api/admin/login')
        .send({ pin: config.adminPin });
      await request(app)
        .post('/api/admin/draw')
        .set('Cookie', loginRes.headers['set-cookie']);

      // Find who gifts Participant 1 in DB
      const assignments = db.prepare('SELECT * FROM assignments').all() as Array<{
        giver_id: number;
        receiver_id: number;
      }>;
      const whoGifts1 = assignments.find((a) => a.receiver_id === 1)?.giver_id;
      const who1Gifts = assignments.find((a) => a.giver_id === 1)?.receiver_id;

      expect(whoGifts1).toBeDefined();
      expect(who1Gifts).toBeDefined();
      expect(whoGifts1).not.toBe(1);
      expect(who1Gifts).not.toBe(1);

      // Create session for Participant 1
      const token1 = q.createSession(1, false);

      // Probe /api/me/assignment
      const res = await request(app)
        .get('/api/me/assignment')
        .set('Cookie', `session_token=${token1}`);

      expect(res.status).toBe(200);
      expect(res.body.isDrawn).toBe(true);

      // Participant 1 only sees their assigned receiver (who 1 gifts)
      expect(res.body.partner).toBeDefined();
      expect(res.body.partner.id).toBe(who1Gifts);
      expect(res.body.teaser).toBeDefined();
      expect(typeof res.body.teaser.sentence).toBe('string');

      // ZERO-LEAKAGE VERIFICATION:
      // 1. Response must NOT contain giver identity
      expect(res.body).not.toHaveProperty('giver');
      expect(res.body).not.toHaveProperty('giverId');
      expect(res.body).not.toHaveProperty('giver_id');
      expect(res.body).not.toHaveProperty('secretSanta');

      // 2. Response must NOT contain any other participant IDs or pairings
      expect(res.body).not.toHaveProperty('pairs');
      expect(res.body).not.toHaveProperty('assignments');
      expect(res.body).not.toHaveProperty('allAssignments');
      expect(res.body).not.toHaveProperty('participants');

      // 3. Stringified response must NOT contain whoGifts1 id as a key or property value
      const rawJson = JSON.stringify(res.body);
      expect(rawJson).not.toContain(`"giver"`);
      expect(rawJson).not.toContain(`"giver_id"`);

      // 4. Parameter tampering probe: passing participantId or target queries does NOT leak third-party data
      const tamperedRes = await request(app)
        .get('/api/me/assignment?participantId=2&target=2')
        .set('Cookie', `session_token=${token1}`);

      expect(tamperedRes.status).toBe(200);
      expect(tamperedRes.body.partner.id).toBe(who1Gifts); // Still only returns Participant 1's partner!
    });
  });

  // =========================================================================
  // 7. Additional Adversarial Security & Concurrency Boundaries
  // =========================================================================
  describe('7. Additional Adversarial Security & Concurrency Boundaries', () => {
    it('concurrent draw race condition: two simultaneous draw requests -> exactly one 200, second 409', async () => {
      const q = createQueryLayer(db);
      for (let id = 1; id <= 24; id++) {
        q.setParticipantRegistered(id);
      }

      config.allowPartialDraw = false;
      const loginRes = await request(app).post('/api/admin/login').send({ pin: config.adminPin });
      const cookie = loginRes.headers['set-cookie'];

      // Fire two concurrent draw requests
      const [drawA, drawB] = await Promise.all([
        request(app).post('/api/admin/draw').set('Cookie', cookie),
        request(app).post('/api/admin/draw').set('Cookie', cookie),
      ]);

      const statuses = [drawA.status, drawB.status];
      expect(statuses.sort()).toEqual([200, 409]);

      // Assignments table contains exactly 24 rows
      const cnt = db.prepare('SELECT COUNT(*) as c FROM assignments').get() as { c: number };
      expect(cnt.c).toBe(24);
    });

    it('privilege escalation probe: participant session is forbidden from admin endpoints (403)', async () => {
      const q = createQueryLayer(db);
      const participantToken = q.createSession(1, false);
      const cookie = `session_token=${participantToken}`;

      // Try calling admin endpoints
      const drawAttempt = await request(app).post('/api/admin/draw').set('Cookie', cookie);
      expect(drawAttempt.status).toBe(403);
      expect(drawAttempt.body.code).toBe('FORBIDDEN');

      const overviewAttempt = await request(app).get('/api/admin/overview').set('Cookie', cookie);
      expect(overviewAttempt.status).toBe(403);
      expect(overviewAttempt.body.code).toBe('FORBIDDEN');
    });

    it('role separation probe: admin session cannot access participant /api/me endpoints without participant identity', async () => {
      const loginRes = await request(app).post('/api/admin/login').send({ pin: config.adminPin });
      const cookie = loginRes.headers['set-cookie'];

      const meAttempt = await request(app).get('/api/me/assignment').set('Cookie', cookie);
      expect(meAttempt.status).toBe(401);
      expect(meAttempt.body.code).toBe('PARTICIPANT_REQUIRED');
    });

    it('wishlist boundary probe: payload > 2000 chars is rejected with 400 CONTENT_TOO_LONG', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(1, false);
      const cookie = `session_token=${token}`;

      const res = await request(app)
        .put('/api/me/wishlist')
        .set('Cookie', cookie)
        .send({ content: 'A'.repeat(2001) });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CONTENT_TOO_LONG');
    });

    it('partner wishlist pre-draw probe: blocked with 400 NOT_DRAWN_YET before draw occurs', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(1, false);
      const cookie = `session_token=${token}`;

      const res = await request(app)
        .get('/api/partner/wishlist')
        .set('Cookie', cookie);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NOT_DRAWN_YET');
    });
  });
});
