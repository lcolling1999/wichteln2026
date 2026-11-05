import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
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

import { setDatabase, runTransaction } from '../../server/db/database.js';
import { initializeSchema } from '../../server/db/schema.js';
import { seedDatabase, SEED_COLLEAGUES } from '../../server/db/seeds.js';
import { createQueryLayer } from '../../server/db/queries.js';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import {
  generateSingleCycleDerangement,
  verifyAssignmentsIntegrity,
} from '../../server/services/derangement.service.js';
import { AppPhase, Participant } from '../../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers & Mock Constructors
// ---------------------------------------------------------------------------

function buildClientRegistrationResponse(challenge: string, credId = 'cred-stress-123') {
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

function buildClientAuthenticationResponse(challenge: string, credId = 'cred-stress-123') {
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
      userHandle: 'mockUserHandle',
    },
    type: 'public-key' as const,
    clientExtensionResults: {},
  };
}

// ---------------------------------------------------------------------------
// Pure Client State Machine Formal Model for Stress Verification
// ---------------------------------------------------------------------------

export interface ClientState {
  phase: AppPhase;
  user: Participant | null;
  isDrawn: boolean;
  boltsLocked: number;
}

export type ClientEvent =
  | { type: 'LOGIN_SUCCESS'; participant: Participant }
  | { type: 'DRAW_COMPLETED' }
  | { type: 'SAFE_BOLT_LOCKED' }
  | { type: 'BACK_TO_LOBBY' }
  | { type: 'LOGOUT' }
  | { type: 'DIRECT_JUMP'; targetPhase: AppPhase };

export function clientStateMachineReducer(state: ClientState, event: ClientEvent): ClientState {
  switch (event.type) {
    case 'LOGIN_SUCCESS': {
      const nextPhase: AppPhase = state.isDrawn ? 'phase3_safedial' : 'phase2_lobby';
      return {
        ...state,
        user: event.participant,
        phase: nextPhase,
      };
    }
    case 'DRAW_COMPLETED': {
      // Guard: unauthenticated users remain in onboarding; only lobby advances to safe dial
      const nextPhase: AppPhase =
        state.phase === 'phase2_lobby' && state.user !== null
          ? 'phase3_safedial'
          : state.phase;
      return {
        ...state,
        isDrawn: true,
        phase: nextPhase,
      };
    }
    case 'SAFE_BOLT_LOCKED': {
      if (state.phase !== 'phase3_safedial') {
        return state;
      }
      const nextBolts = Math.min(3, state.boltsLocked + 1);
      return {
        ...state,
        boltsLocked: nextBolts,
        phase: nextBolts >= 3 ? 'phase4_reveal' : 'phase3_safedial',
      };
    }
    case 'BACK_TO_LOBBY': {
      if (state.phase === 'phase4_reveal' && state.user !== null) {
        return {
          ...state,
          phase: 'phase2_lobby',
        };
      }
      return state;
    }
    case 'LOGOUT': {
      return {
        phase: 'phase1_onboarding',
        user: null,
        isDrawn: state.isDrawn,
        boltsLocked: 0,
      };
    }
    case 'DIRECT_JUMP': {
      // Security Guards for Direct Navigation / URL Jumping:
      // 1. Unauthenticated users cannot jump outside onboarding
      if (!state.user && event.targetPhase !== 'phase1_onboarding') {
        return state; // Rejected
      }
      // 2. Cannot jump to safe dial or reveal before draw completes
      if (!state.isDrawn && (event.targetPhase === 'phase3_safedial' || event.targetPhase === 'phase4_reveal')) {
        return state; // Rejected
      }
      // 3. Cannot jump directly to reveal without unlocking 3 bolts
      if (event.targetPhase === 'phase4_reveal' && state.boltsLocked < 3) {
        return state; // Rejected
      }
      return {
        ...state,
        phase: event.targetPhase,
      };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// TEST SUITE: Milestone 5 Tier 5 Adversarial Stress & White-Box Challenge
// ---------------------------------------------------------------------------

describe('Milestone 5 Tier 5 White-Box Adversarial Stress Suite', () => {
  const PARTICIPANTS_24 = Array.from({ length: 24 }, (_, i) => i + 1);
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

    config.allowPartialDraw = false;
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // PILLAR 1: Mathematical Verification & Uniformity (10,000 Monte Carlo Draws)
  // =========================================================================

  describe('Pillar 1: 10,000 Monte Carlo Single-Cycle Derangements & Statistical Uniformity', () => {
    const ITERATIONS = 10000;

    it(
      `executes ${ITERATIONS} Monte Carlo draws proving zero fixed points, bijectivity, single Hamiltonian cycles, and zero sub-cycles`,
      () => {
        let fixedPointCount = 0;
        let bijectivityViolations = 0;
        let subcycleViolations = 0;
        let twoCycleReciprocityViolations = 0;
        let hashVerificationFailures = 0;

        // 24x24 directed edge frequency tracking (1-indexed)
        const edgeMatrix: number[][] = Array.from({ length: 25 }, () => new Array(25).fill(0));

        const startPerf = performance.now();

        for (let iter = 0; iter < ITERATIONS; iter++) {
          const result = generateSingleCycleDerangement(PARTICIPANTS_24);
          const pairs = result.pairs;

          if (pairs.length !== 24) {
            bijectivityViolations++;
          }

          const map = new Map<number, number>();
          for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
            const p = pairs[pIdx];
            if (p.giver_id === p.receiver_id) {
              fixedPointCount++;
            }
            map.set(p.giver_id, p.receiver_id);
            edgeMatrix[p.giver_id][p.receiver_id]++;
          }

          if (map.size !== 24) {
            bijectivityViolations++;
          }
          const receiverSet = new Set(pairs.map((p) => p.receiver_id));
          if (receiverSet.size !== 24) {
            bijectivityViolations++;
          }

          // Single Hamiltonian Cycle Check:
          // Starting from node 1, following 24 steps must visit all 24 distinct nodes and return to 1
          let curr = 1;
          const visited = new Set<number>();
          for (let step = 0; step < 24; step++) {
            visited.add(curr);
            curr = map.get(curr)!;
          }
          if (visited.size !== 24 || curr !== 1) {
            subcycleViolations++;
          }

          // Zero 2-cycle reciprocity (A -> B and B -> A is forbidden for N=24 single cycle)
          for (const [giver, receiver] of map.entries()) {
            if (map.get(receiver) === giver) {
              twoCycleReciprocityViolations++;
            }
          }

          // Spot-check verification hash integrity every 100 iterations
          if (iter % 100 === 0) {
            const isValid = verifyAssignmentsIntegrity(result.pairs, result.verificationHash);
            if (!isValid) {
              hashVerificationFailures++;
            }
          }
        }

        const durationMs = performance.now() - startPerf;

        // Strictly assert zero algorithmic violations
        expect(fixedPointCount).toBe(0);
        expect(bijectivityViolations).toBe(0);
        expect(subcycleViolations).toBe(0);
        expect(twoCycleReciprocityViolations).toBe(0);
        expect(hashVerificationFailures).toBe(0);

        // Verify diagonal elements are strictly 0
        for (let i = 1; i <= 24; i++) {
          expect(edgeMatrix[i][i]).toBe(0);
        }

        // Uniformity Analysis:
        // 552 off-diagonal pairs. Expected per edge: 10,000 / 23 = ~434.78
        // Std Dev sigma = sqrt(10000 * (1/23) * (22/23)) ~ 20.39
        // 5-sigma bounds: [434.78 - 102, 434.78 + 102] = [332, 537]
        let minEdge = Infinity;
        let maxEdge = -Infinity;
        let unhitEdges = 0;
        let chiSquare = 0;
        const expectedPerEdge = ITERATIONS / 23;

        for (let g = 1; g <= 24; g++) {
          for (let r = 1; r <= 24; r++) {
            if (g === r) continue;
            const count = edgeMatrix[g][r];
            if (count === 0) unhitEdges++;
            if (count < minEdge) minEdge = count;
            if (count > maxEdge) maxEdge = count;

            const diff = count - expectedPerEdge;
            chiSquare += (diff * diff) / expectedPerEdge;
          }
        }

        expect(unhitEdges).toBe(0);
        // Robust 6-sigma bounds: Every single edge visited between 300 and 580 times
        expect(minEdge).toBeGreaterThan(300);
        expect(maxEdge).toBeLessThan(580);

        // Chi-Square goodness-of-fit for 551 degrees of freedom (dof = 551, mean = 551, std = ~33.2)
        // 99.9% confidence interval: 400 < chiSquare < 720
        expect(chiSquare).toBeGreaterThan(400);
        expect(chiSquare).toBeLessThan(720);

        // Performance check: 10,000 draws should execute well under 5 seconds
        expect(durationMs).toBeLessThan(5000);
      }
    );

    it('proves tamper detection in verification hash: altering any single assignment invalidates hash', () => {
      const result = generateSingleCycleDerangement(PARTICIPANTS_24);
      expect(verifyAssignmentsIntegrity(result.pairs, result.verificationHash)).toBe(true);

      // Tamper: swap receivers of pair 0 and pair 1
      const tamperedPairs = result.pairs.map((p) => ({ ...p }));
      const temp = tamperedPairs[0].receiver_id;
      tamperedPairs[0].receiver_id = tamperedPairs[1].receiver_id;
      tamperedPairs[1].receiver_id = temp;

      expect(verifyAssignmentsIntegrity(tamperedPairs, result.verificationHash)).toBe(false);
    });
  });

  // =========================================================================
  // PILLAR 2: Rapid Concurrent Registrations, Logins, and Draw Triggers
  // =========================================================================

  describe('Pillar 2: High-Concurrency Stress Harness (Registrations, Logins, Draw Triggers)', () => {
    it('simulates 24 simultaneous WebAuthn registrations in parallel (full rush hour)', async () => {
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

      // 1. Concurrently fetch registration options for all 24 colleagues
      const optionsPromises = PARTICIPANTS_24.map((id) =>
        request(app).post('/api/auth/register-options').send({ participantId: id })
      );
      const optionsResponses = await Promise.all(optionsPromises);
      for (const optRes of optionsResponses) {
        expect(optRes.status).toBe(200);
        expect(optRes.body.challenge).toBeDefined();
      }

      // 2. Concurrently fire 24 register-verify requests
      const verifyPromises = optionsResponses.map((optRes, index) => {
        const participantId = PARTICIPANTS_24[index];
        const payload = {
          participantId,
          response: buildClientRegistrationResponse(optRes.body.challenge, `cred-user-${participantId}`),
        };
        return request(app).post('/api/auth/register-verify').send(payload);
      });

      const verifyResponses = await Promise.all(verifyPromises);

      // Every single one of the 24 registrations must succeed
      for (let i = 0; i < 24; i++) {
        const res = verifyResponses[i];
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.participant.id).toBe(PARTICIPANTS_24[i]);
        expect(res.headers['set-cookie']).toBeDefined();
      }

      // Check DB consistency: exactly 24 registered, 24 authenticators
      const q = createQueryLayer(db);
      expect(q.getRegisteredCount()).toBe(24);
      const authCount = (db.prepare('SELECT COUNT(*) as count FROM authenticators').get() as { count: number }).count;
      expect(authCount).toBe(24);
    });

    it('simulates 24 simultaneous registrations for the SAME participant (race condition blast test)', async () => {
      vi.mocked(verifyRegistrationResponse).mockImplementation(async ({ response }: any) => {
        return {
          verified: true,
          registrationInfo: {
            credential: {
              id: response.id,
              publicKey: new Uint8Array([10, 20, 30]),
              counter: 0,
              transports: ['internal'],
            },
            credentialDeviceType: 'singleDevice',
            credentialBackedUp: false,
          },
        } as any;
      });

      const optRes = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId: 1 });
      expect(optRes.status).toBe(200);
      const challenge = optRes.body.challenge;

      const payload = {
        participantId: 1,
        response: buildClientRegistrationResponse(challenge, 'cred-same-participant-race'),
      };

      // 24 concurrent requests for participant 1
      const burstPromises = Array.from({ length: 24 }, () =>
        request(app).post('/api/auth/register-verify').send(payload)
      );

      const burstResponses = await Promise.all(burstPromises);
      const statusCounts: Record<number, number> = {};
      for (const res of burstResponses) {
        statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
      }

      // Invariant: Exactly 1 winner (200 OK) and 23 losers (409 Conflict)
      expect(statusCounts[200]).toBe(1);
      expect(statusCounts[409]).toBe(23);

      const conflictResponses = burstResponses.filter((r) => r.status === 409);
      for (const c of conflictResponses) {
        expect(c.body.code).toBe('ALREADY_REGISTERED');
      }

      // Database has strictly 1 authenticator for participant 1
      const authCount = (
        db.prepare('SELECT COUNT(*) as count FROM authenticators WHERE participant_id = 1').get() as { count: number }
      ).count;
      expect(authCount).toBe(1);
    });

    it('simulates 24 concurrent WebAuthn logins across all registered colleagues', async () => {
      // First seed all 24 as registered with authenticators
      const q = createQueryLayer(db);
      for (let id = 1; id <= 24; id++) {
        q.setParticipantRegistered(id);
        q.createAuthenticator({
          id: `cred-auth-${id}`,
          participant_id: id,
          public_key: Buffer.from([1, 2, 3]),
          counter: 5,
          device_type: 'singleDevice',
          backed_up: false,
        });
      }

      vi.mocked(verifyAuthenticationResponse).mockImplementation(async ({ response, credential }: any) => {
        return {
          verified: true,
          authenticationInfo: {
            newCounter: credential.counter + 1,
            credentialDeviceType: 'singleDevice',
            credentialBackedUp: false,
          },
        } as any;
      });

      // 24 concurrent login option requests
      const optPromises = PARTICIPANTS_24.map((id) =>
        request(app).post('/api/auth/login-options').send({ participantId: id })
      );
      const optResponses = await Promise.all(optPromises);

      // 24 concurrent login verify requests
      const loginPromises = optResponses.map((optRes, idx) => {
        const id = PARTICIPANTS_24[idx];
        const payload = {
          response: buildClientAuthenticationResponse(optRes.body.challenge, `cred-auth-${id}`),
        };
        return request(app).post('/api/auth/login-verify').send(payload);
      });

      const loginResponses = await Promise.all(loginPromises);

      for (let i = 0; i < 24; i++) {
        const res = loginResponses[i];
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.participant.id).toBe(PARTICIPANTS_24[i]);
        expect(res.headers['set-cookie']).toBeDefined();
      }

      // Check counters were incremented to 6
      for (let id = 1; id <= 24; id++) {
        const auth = q.getAuthenticatorById(`cred-auth-${id}`);
        expect(auth?.counter).toBe(6);
      }
    });

    it('simulates 10 concurrent admin draw trigger requests: exactly 1 succeeds, 9 return 409 Conflict', async () => {
      // Register all 24 colleagues
      const q = createQueryLayer(db);
      for (let id = 1; id <= 24; id++) {
        q.setParticipantRegistered(id);
      }

      // Create admin session
      const adminToken = q.createSession(null, true);

      // Fire 10 simultaneous draw requests
      const drawPromises = Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/admin/draw')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const drawResponses = await Promise.all(drawPromises);
      const statusCounts: Record<number, number> = {};
      for (const res of drawResponses) {
        statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
      }

      expect(statusCounts[200]).toBe(1);
      expect(statusCounts[409]).toBe(9);

      const successRes = drawResponses.find((r) => r.status === 200)!;
      expect(successRes.body.success).toBe(true);
      expect(successRes.body.pairCount).toBe(24);
      expect(successRes.body.verificationHash).toBeDefined();

      const conflictResponses = drawResponses.filter((r) => r.status === 409);
      for (const c of conflictResponses) {
        expect(c.body.code).toBe('ALREADY_DRAWN');
      }

      // Invariant: DB draw_status has is_drawn = 1, exactly 24 assignments
      const drawStatus = q.getDrawStatus();
      expect(drawStatus.is_drawn).toBe(1);
      const assignments = q.getAllAssignmentsWithNames();
      expect(assignments).toHaveLength(24);
    });
  });

  // =========================================================================
  // PILLAR 3: Client State Machine Stress & Boundary Transitions
  // =========================================================================

  describe('Pillar 3: Client State Machine Stress & Boundary Invariant Fuzzing', () => {
    it('verifies state machine guards against unauthenticated phase jumps', () => {
      let state: ClientState = {
        phase: 'phase1_onboarding',
        user: null,
        isDrawn: false,
        boltsLocked: 0,
      };

      // Attempt jump to lobby while unauthenticated -> must be rejected
      state = clientStateMachineReducer(state, { type: 'DIRECT_JUMP', targetPhase: 'phase2_lobby' });
      expect(state.phase).toBe('phase1_onboarding');

      // Attempt jump to safe dial while unauthenticated -> must be rejected
      state = clientStateMachineReducer(state, { type: 'DIRECT_JUMP', targetPhase: 'phase3_safedial' });
      expect(state.phase).toBe('phase1_onboarding');

      // Attempt jump to reveal while unauthenticated -> must be rejected
      state = clientStateMachineReducer(state, { type: 'DIRECT_JUMP', targetPhase: 'phase4_reveal' });
      expect(state.phase).toBe('phase1_onboarding');
    });

    it('verifies state machine guards against jumping to reveal before draw or bolt lock', () => {
      const mockUser: Participant = { id: 1, name: 'Lada' };
      let state: ClientState = {
        phase: 'phase1_onboarding',
        user: null,
        isDrawn: false,
        boltsLocked: 0,
      };

      // Authenticate -> goes to lobby because isDrawn = false
      state = clientStateMachineReducer(state, { type: 'LOGIN_SUCCESS', participant: mockUser });
      expect(state.phase).toBe('phase2_lobby');
      expect(state.user).toEqual(mockUser);

      // Attempt direct jump to safe dial before draw -> must be rejected
      state = clientStateMachineReducer(state, { type: 'DIRECT_JUMP', targetPhase: 'phase3_safedial' });
      expect(state.phase).toBe('phase2_lobby');

      // Attempt direct jump to reveal before draw -> must be rejected
      state = clientStateMachineReducer(state, { type: 'DIRECT_JUMP', targetPhase: 'phase4_reveal' });
      expect(state.phase).toBe('phase2_lobby');

      // Now draw happens!
      state = clientStateMachineReducer(state, { type: 'DRAW_COMPLETED' });
      expect(state.isDrawn).toBe(true);
      expect(state.phase).toBe('phase3_safedial');

      // Cannot jump directly to reveal until 3 bolts are locked
      state = clientStateMachineReducer(state, { type: 'DIRECT_JUMP', targetPhase: 'phase4_reveal' });
      expect(state.phase).toBe('phase3_safedial');

      // Bolt progression: 1 -> 2 -> 3
      state = clientStateMachineReducer(state, { type: 'SAFE_BOLT_LOCKED' });
      expect(state.boltsLocked).toBe(1);
      expect(state.phase).toBe('phase3_safedial');

      state = clientStateMachineReducer(state, { type: 'SAFE_BOLT_LOCKED' });
      expect(state.boltsLocked).toBe(2);
      expect(state.phase).toBe('phase3_safedial');

      state = clientStateMachineReducer(state, { type: 'SAFE_BOLT_LOCKED' });
      expect(state.boltsLocked).toBe(3);
      expect(state.phase).toBe('phase4_reveal'); // Unlocked!

      // Back to lobby
      state = clientStateMachineReducer(state, { type: 'BACK_TO_LOBBY' });
      expect(state.phase).toBe('phase2_lobby');
    });

    it('verifies unauthenticated user waiting in onboarding is NOT skipped when draw completes', () => {
      let state: ClientState = {
        phase: 'phase1_onboarding',
        user: null,
        isDrawn: false,
        boltsLocked: 0,
      };

      // Draw occurs while user is still on login/onboarding screen
      state = clientStateMachineReducer(state, { type: 'DRAW_COMPLETED' });
      expect(state.isDrawn).toBe(true);
      // Crucial: phase remains onboarding so user can log in!
      expect(state.phase).toBe('phase1_onboarding');

      // Once user logs in, they jump directly to safe dial
      const mockUser: Participant = { id: 2, name: 'Sara' };
      state = clientStateMachineReducer(state, { type: 'LOGIN_SUCCESS', participant: mockUser });
      expect(state.phase).toBe('phase3_safedial');
    });

    it('Monte Carlo Fuzzing: 10,000 random transition sequences preserve all state invariants', () => {
      const mockUser: Participant = { id: 7, name: 'Julia' };
      let state: ClientState = {
        phase: 'phase1_onboarding',
        user: null,
        isDrawn: false,
        boltsLocked: 0,
      };

      const eventGenerators: Array<() => ClientEvent> = [
        () => ({ type: 'LOGIN_SUCCESS', participant: mockUser }),
        () => ({ type: 'DRAW_COMPLETED' }),
        () => ({ type: 'SAFE_BOLT_LOCKED' }),
        () => ({ type: 'BACK_TO_LOBBY' }),
        () => ({ type: 'LOGOUT' }),
        () => ({ type: 'DIRECT_JUMP', targetPhase: 'phase1_onboarding' }),
        () => ({ type: 'DIRECT_JUMP', targetPhase: 'phase2_lobby' }),
        () => ({ type: 'DIRECT_JUMP', targetPhase: 'phase3_safedial' }),
        () => ({ type: 'DIRECT_JUMP', targetPhase: 'phase4_reveal' }),
      ];

      for (let i = 0; i < 10000; i++) {
        const randomEvent = eventGenerators[Math.floor(Math.random() * eventGenerators.length)]();
        state = clientStateMachineReducer(state, randomEvent);

        // Invariant 1: If user is null, phase MUST be phase1_onboarding
        if (state.user === null) {
          expect(state.phase).toBe('phase1_onboarding');
        }

        // Invariant 2: If phase is phase3_safedial or phase4_reveal, isDrawn MUST be true
        if (state.phase === 'phase3_safedial' || state.phase === 'phase4_reveal') {
          expect(state.isDrawn).toBe(true);
          expect(state.user).not.toBeNull();
        }

        // Invariant 3: If phase is phase4_reveal, boltsLocked MUST be 3
        if (state.phase === 'phase4_reveal') {
          expect(state.boltsLocked).toBe(3);
        }

        // Invariant 4: boltsLocked is clamped between 0 and 3
        expect(state.boltsLocked).toBeGreaterThanOrEqual(0);
        expect(state.boltsLocked).toBeLessThanOrEqual(3);
      }
    });
  });

  // =========================================================================
  // PILLAR 4: Token Handling, Session Lifecycle & Adversarial Injection
  // =========================================================================

  describe('Pillar 4: Session Security, Adversarial Token Injection & Zero-Leakage', () => {
    it('authenticates seamlessly via Authorization Bearer header', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(3, false);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.participant.id).toBe(3);
    });

    it('authenticates seamlessly via session_token cookie', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(4, false);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `session_token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.participant.id).toBe(4);
    });

    it('rejects expired sessions and cleans them up from the database', async () => {
      const q = createQueryLayer(db);
      // Manually insert an expired session (1 hour in the past)
      const expiredToken = crypto.randomBytes(32).toString('hex');
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
      db.prepare('INSERT INTO sessions (id, participant_id, is_admin, expires_at) VALUES (?, 5, 0, ?)').run(
        expiredToken,
        pastDate
      );

      const res = await request(app)
        .get('/api/me/assignment')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PARTICIPANT_REQUIRED');

      // Verify the expired session was purged
      const checkSession = q.getSession(expiredToken);
      expect(checkSession).toBeNull();
    });

    it('safely handles adversarial, malformed, and SQL injection tokens without leaking errors', async () => {
      const maliciousHeaderTokens = [
        "'; DROP TABLE sessions; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM sessions --",
        'Bearer '.repeat(20),
        'a'.repeat(4096), // 4KB oversized token
        '   ',
        'null',
        'undefined',
        '<script>alert(1)</script>',
        '../../../etc/passwd',
      ];

      for (const malToken of maliciousHeaderTokens) {
        // Test in Authorization header
        const resHeader = await request(app)
          .get('/api/me/assignment')
          .set('Authorization', `Bearer ${malToken}`);

        expect(resHeader.status).toBe(401);
        expect(resHeader.body.code).toBe('PARTICIPANT_REQUIRED');
        expect(resHeader.body.error).toBeDefined();
        // Assert zero leak of DB errors or stack traces
        expect(JSON.stringify(resHeader.body)).not.toContain('SQLITE');
        expect(JSON.stringify(resHeader.body)).not.toContain('syntax error');
        expect(JSON.stringify(resHeader.body)).not.toContain('node:sqlite');
      }

      const maliciousCookieTokens = [
        ...maliciousHeaderTokens,
        'admin\x00injection',
        'b'.repeat(2048), // 2KB oversized cookie within HTTP header limit
      ];

      for (const malToken of maliciousCookieTokens) {
        // Test in Cookie
        const resCookie = await request(app)
          .get('/api/me/assignment')
          .set('Cookie', `session_token=${encodeURIComponent(malToken)}`);

        expect(resCookie.status).toBe(401);
        expect(resCookie.body.code).toBe('PARTICIPANT_REQUIRED');
      }

      // Test extreme HTTP header flood protection (16KB cookie triggers HTTP 431 Request Header Fields Too Large)
      const resFlood = await request(app)
        .get('/api/me/assignment')
        .set('Cookie', `session_token=${encodeURIComponent('c'.repeat(16384))}`);
      expect(resFlood.status).toBe(431);

      // Assert database tables are intact after injection attempts
      const q = createQueryLayer(db);
      expect(q.getAllParticipants()).toHaveLength(24);
    });

    it('enforces Zero-Leakage: Participant A NEVER sees Participant B assignment or partner data', async () => {
      const q = createQueryLayer(db);
      // Register all 24 and execute draw
      for (let id = 1; id <= 24; id++) {
        q.setParticipantRegistered(id);
      }
      const adminToken = q.createSession(null, true);
      const drawRes = await request(app)
        .post('/api/admin/draw')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(drawRes.status).toBe(200);

      // Create session for Participant 1 (Lada) and Participant 2 (Sara)
      const token1 = q.createSession(1, false);
      const token2 = q.createSession(2, false);

      const res1 = await request(app)
        .get('/api/me/assignment')
        .set('Authorization', `Bearer ${token1}`);
      expect(res1.status).toBe(200);
      expect(res1.body.isDrawn).toBe(true);
      expect(res1.body.partner.id).not.toBe(1); // Never self

      const res2 = await request(app)
        .get('/api/me/assignment')
        .set('Authorization', `Bearer ${token2}`);
      expect(res2.status).toBe(200);
      expect(res2.body.isDrawn).toBe(true);
      expect(res2.body.partner.id).not.toBe(2); // Never self

      // Zero-leakage: Participant 1 only receives their single assigned partner
      expect(Object.keys(res1.body)).toEqual(expect.arrayContaining(['isDrawn', 'partner', 'teaser']));
      expect(res1.body.allAssignments).toBeUndefined();
      expect(res1.body.pairs).toBeUndefined();

      // If Participant 1 tries to access admin overview -> 403 Forbidden
      const adminOverviewRes = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${token1}`);
      expect(adminOverviewRes.status).toBe(403);
      expect(adminOverviewRes.body.code).toBe('FORBIDDEN');
    });
  });
});
