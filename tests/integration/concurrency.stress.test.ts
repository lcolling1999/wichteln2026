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

describe('Empirical Concurrency & Race Condition Stress Suite', () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = new DatabaseSync(':memory:', {
      enableForeignKeyConstraints: true,
    });
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    initializeSchema(db);
    seedDatabase(db);
    setDatabase(db);

    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('1. Dual simultaneous registration verify requests: exactly one 200 and one 409 Conflict (ALREADY_REGISTERED)', async () => {
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-dual-race',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    } as any);

    const optRes = await request(app)
      .post('/api/auth/register-options')
      .send({ participantId: 1 });
    expect(optRes.status).toBe(200);
    const challenge = optRes.body.challenge;

    const payload = {
      participantId: 1,
      response: buildClientRegistrationResponse(challenge, 'cred-dual-race'),
    };

    const [resA, resB] = await Promise.all([
      request(app).post('/api/auth/register-verify').send(payload),
      request(app).post('/api/auth/register-verify').send(payload),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const successRes = resA.status === 200 ? resA : resB;
    const conflictRes = resA.status === 409 ? resA : resB;

    expect(successRes.body.success).toBe(true);
    expect(successRes.body.participant.id).toBe(1);
    expect(successRes.headers['set-cookie']).toBeDefined();
    expect(successRes.headers['set-cookie'][0]).toContain('session_token=');

    expect(conflictRes.body.code).toBe('ALREADY_REGISTERED');
    expect(conflictRes.body.error).toContain('bereits registriert');
  });

  it('2. High-concurrency burst (10 simultaneous requests): exactly one 200 and nine 409 Conflict', async () => {
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-burst-10',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    } as any);

    const optRes = await request(app)
      .post('/api/auth/register-options')
      .send({ participantId: 2 });
    expect(optRes.status).toBe(200);
    const challenge = optRes.body.challenge;

    const payload = {
      participantId: 2,
      response: buildClientRegistrationResponse(challenge, 'cred-burst-10'),
    };

    const burstCount = 10;
    const promises = Array.from({ length: burstCount }, () =>
      request(app).post('/api/auth/register-verify').send(payload)
    );

    const responses = await Promise.all(promises);
    const statusCounts: Record<number, number> = {};
    for (const res of responses) {
      statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
    }

    expect(statusCounts[200]).toBe(1);
    expect(statusCounts[409]).toBe(burstCount - 1);
    expect(Object.keys(statusCounts)).toHaveLength(2);

    // Verify all 409 responses carry code ALREADY_REGISTERED
    const conflictResponses = responses.filter((r) => r.status === 409);
    for (const cRes of conflictResponses) {
      expect(cRes.body.code).toBe('ALREADY_REGISTERED');
    }

    // Verify database state: exactly 1 authenticator in DB for participant 2
    const q = createQueryLayer(db);
    const participant = q.getParticipantById(2);
    expect(participant?.is_registered).toBe(1);

    const authCount = db.prepare('SELECT COUNT(*) as cnt FROM authenticators WHERE participant_id = 2').get() as { cnt: number };
    expect(authCount.cnt).toBe(1);
  });

  it('3. Subsequent registration attempts for an already-registered participant return 409 Conflict', async () => {
    const q = createQueryLayer(db);
    q.setParticipantRegistered(3);

    // Attempt via register-options
    const optRes = await request(app)
      .post('/api/auth/register-options')
      .send({ participantId: 3 });
    expect(optRes.status).toBe(409);
    expect(optRes.body.code).toBe('ALREADY_REGISTERED');

    // Attempt directly via register-verify
    const dummyPayload = {
      participantId: 3,
      response: buildClientRegistrationResponse('some-stale-challenge', 'cred-3'),
    };
    const verifyRes = await request(app)
      .post('/api/auth/register-verify')
      .send(dummyPayload);
    expect(verifyRes.status).toBe(409);
    expect(verifyRes.body.code).toBe('ALREADY_REGISTERED');
  });

  it('4. Missing challenge attempts for unregistered participant return 400 Bad Request (CHALLENGE_NOT_FOUND)', async () => {
    const q = createQueryLayer(db);
    const p = q.getParticipantById(4);
    expect(p?.is_registered).toBe(0);

    const dummyPayload = {
      participantId: 4,
      response: buildClientRegistrationResponse('unissued-challenge-xyz', 'cred-4'),
    };

    const res = await request(app)
      .post('/api/auth/register-verify')
      .send(dummyPayload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CHALLENGE_NOT_FOUND');
    expect(res.body.error).toContain('ungültig oder abgelaufen');
  });

  it('5. Simultaneous registrations for DIFFERENT participants all succeed concurrently', async () => {
    vi.mocked(verifyRegistrationResponse).mockImplementation(async ({ response }: any) => {
      return {
        verified: true,
        registrationInfo: {
          credential: {
            id: response.id,
            publicKey: new Uint8Array([5, 6, 7]),
            counter: 0,
            transports: ['internal'],
          },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      } as any;
    });

    const participantIds = [5, 6, 7, 8];
    const payloads = await Promise.all(
      participantIds.map(async (id) => {
        const opt = await request(app)
          .post('/api/auth/register-options')
          .send({ participantId: id });
        expect(opt.status).toBe(200);
        return {
          participantId: id,
          response: buildClientRegistrationResponse(opt.body.challenge, `cred-${id}`),
        };
      })
    );

    // Fire all 4 registrations simultaneously
    const responses = await Promise.all(
      payloads.map((p) => request(app).post('/api/auth/register-verify').send(p))
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }

    const q = createQueryLayer(db);
    for (const id of participantIds) {
      expect(q.getParticipantById(id)?.is_registered).toBe(1);
    }
  });

  it('6. Error recovery: failed verification cleans up in-flight lock, allowing retry', async () => {
    // 1st attempt: cryptographic verification fails
    vi.mocked(verifyRegistrationResponse).mockRejectedValueOnce(
      new Error('Verification signature corrupted')
    );

    const optRes = await request(app)
      .post('/api/auth/register-options')
      .send({ participantId: 9 });
    expect(optRes.status).toBe(200);

    const payloadFail = {
      participantId: 9,
      response: buildClientRegistrationResponse(optRes.body.challenge, 'cred-9'),
    };

    const failRes = await request(app)
      .post('/api/auth/register-verify')
      .send(payloadFail);

    expect(failRes.status).toBe(400);
    expect(failRes.body.code).toBe('VERIFICATION_FAILED');

    // Participant remains unregistered
    const q = createQueryLayer(db);
    expect(q.getParticipantById(9)?.is_registered).toBe(0);

    // 2nd attempt: new challenge generated and valid verification succeeds (no deadlock!)
    vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-9-retry',
          publicKey: new Uint8Array([9, 9, 9]),
          counter: 0,
          transports: ['internal'],
        },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    } as any);

    const optRes2 = await request(app)
      .post('/api/auth/register-options')
      .send({ participantId: 9 });
    expect(optRes2.status).toBe(200);

    const payloadSuccess = {
      participantId: 9,
      response: buildClientRegistrationResponse(optRes2.body.challenge, 'cred-9-retry'),
    };

    const successRes = await request(app)
      .post('/api/auth/register-verify')
      .send(payloadSuccess);

    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);
    expect(q.getParticipantById(9)?.is_registered).toBe(1);
  });

  it('7. Empirical Monte Carlo Concurrency Stress Test (20 iterations of 5 simultaneous requests)', async () => {
    vi.mocked(verifyRegistrationResponse).mockImplementation(async ({ response }: any) => {
      return {
        verified: true,
        registrationInfo: {
          credential: {
            id: response.id,
            publicKey: new Uint8Array([1, 2, 3]),
            counter: 0,
            transports: ['internal'],
          },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      } as any;
    });

    const ITERATIONS = 20;
    const CONCURRENT_CLIENTS = 5;
    let total200 = 0;
    let total409 = 0;
    let total400 = 0;

    for (let iter = 1; iter <= ITERATIONS; iter++) {
      const participantId = 10 + (iter % 14); // cycle participants 10-23
      const q = createQueryLayer(db);

      // Reset participant to unregistered state if previously set
      db.prepare('DELETE FROM authenticators WHERE participant_id = ?').run(participantId);
      db.prepare('DELETE FROM webauthn_challenges WHERE participant_id = ?').run(participantId);
      db.prepare('UPDATE participants SET is_registered = 0 WHERE id = ?').run(participantId);

      // 1. Get options
      const optRes = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId });
      expect(optRes.status).toBe(200);
      const challenge = optRes.body.challenge;

      // 2. Fire 5 simultaneous requests
      const payloads = Array.from({ length: CONCURRENT_CLIENTS }, (_, idx) => ({
        participantId,
        response: buildClientRegistrationResponse(challenge, `cred-mc-${iter}-${idx}`),
      }));

      const responses = await Promise.all(
        payloads.map((p) => request(app).post('/api/auth/register-verify').send(p))
      );

      const statuses = responses.map((r) => r.status);
      const count200 = statuses.filter((s) => s === 200).length;
      const count409 = statuses.filter((s) => s === 409).length;

      expect(count200).toBe(1);
      expect(count409).toBe(CONCURRENT_CLIENTS - 1);
      total200 += count200;
      total409 += count409;

      // Check DB
      expect(q.getParticipantById(participantId)?.is_registered).toBe(1);
      const authCount = db.prepare('SELECT COUNT(*) as cnt FROM authenticators WHERE participant_id = ?').get(participantId) as { cnt: number };
      expect(authCount.cnt).toBe(1);

      // 3. Subsequent registration returns 409
      const subRes = await request(app)
        .post('/api/auth/register-verify')
        .send(payloads[0]);
      expect(subRes.status).toBe(409);
      expect(subRes.body.code).toBe('ALREADY_REGISTERED');
      total409++;

      // 4. Missing challenge for unregistered participant (ID 24) returns 400
      const missingRes = await request(app)
        .post('/api/auth/register-verify')
        .send({
          participantId: 24,
          response: buildClientRegistrationResponse('unissued', 'cred-24'),
        });
      expect(missingRes.status).toBe(400);
      expect(missingRes.body.code).toBe('CHALLENGE_NOT_FOUND');
      total400++;
    }

    console.log('\n--- MONTE CARLO CONCURRENCY STRESS PROOF ---');
    console.log(`Iterations: ${ITERATIONS}`);
    console.log(`Concurrent requests per iteration: ${CONCURRENT_CLIENTS}`);
    console.log(`Total 200 OK responses: ${total200} (1 per iteration)`);
    console.log(`Total 409 Conflict responses: ${total409} (4 concurrent losers + 1 subsequent per iteration = 5 * 20 = 100)`);
    console.log(`Total 400 Bad Request responses: ${total400} (1 missing-challenge per iteration)`);
    console.log('Invariant: Zero double-registrations, zero 500 errors, exactly 1 winner per burst.');

    expect(total200).toBe(ITERATIONS);
    expect(total409).toBe(ITERATIONS * (CONCURRENT_CLIENTS - 1 + 1));
    expect(total400).toBe(ITERATIONS);
  });
});

