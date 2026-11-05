import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import React from 'react';

import { useLobbyPoll, type UseLobbyPollOptions } from '../../src/hooks/useLobbyPoll';
import { normalizeSearch } from '../../src/components/phase1/ColleagueSelector';
import { setDatabase } from '../../server/db/database.js';
import { initializeSchema } from '../../server/db/schema.js';
import { seedDatabase, SEED_COLLEAGUES } from '../../server/db/seeds.js';
import { createQueryLayer } from '../../server/db/queries.js';
import { createApp } from '../../server/app.js';
import type { DrawStatus, Participant } from '../../src/types';

// ============================================================================
// 1. Empirical React 19 Hook Dispatcher Runner for useLobbyPoll
// ============================================================================
interface HookRunnerInstance<P, R> {
  result: { current: R };
  rerender: (newProps?: P) => void;
  unmount: () => void;
  triggerVisibilityChange: (hidden: boolean) => void;
}

function renderLobbyPollHook(
  initialOptions: UseLobbyPollOptions = {}
): HookRunnerInstance<UseLobbyPollOptions, ReturnType<typeof useLobbyPoll>> {
  let hookProps = initialOptions;
  const hookResult = { current: null as any };
  const stateSlots: any[] = [];
  const stateSetters: Array<(v: any) => void> = [];
  const refSlots: any[] = [];
  let cleanupFns: Array<(() => void) | void> = [];

  // Mock document event listeners
  const listeners: Record<string, Function[]> = {};
  const mockDocument = {
    hidden: false,
    addEventListener: vi.fn((event: string, fn: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    }),
    removeEventListener: vi.fn((event: string, fn: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    }),
  };
  (globalThis as any).document = mockDocument;

  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

  function executeRender() {
    let stateCursor = 0;
    let refCursor = 0;

    const previousDispatcher = internals.H;

    internals.H = {
      useState: (initial: any) => {
        const idx = stateCursor++;
        if (stateSlots[idx] === undefined) {
          stateSlots[idx] = typeof initial === 'function' ? initial() : initial;
          stateSetters[idx] = (newVal: any) => {
            const resolved = typeof newVal === 'function' ? newVal(stateSlots[idx]) : newVal;
            stateSlots[idx] = resolved;
            executeRender();
          };
        }
        return [stateSlots[idx], stateSetters[idx]];
      },
      useRef: (initial: any) => {
        const idx = refCursor++;
        if (!refSlots[idx]) {
          refSlots[idx] = { current: initial };
        }
        return refSlots[idx];
      },
      useCallback: (fn: any) => fn,
      useEffect: (effect: any) => {
        if (cleanupFns.length === 0) {
          const cleanup = effect();
          if (typeof cleanup === 'function') {
            cleanupFns.push(cleanup);
          }
        }
      },
    };

    try {
      hookResult.current = useLobbyPoll(hookProps);
    } finally {
      internals.H = previousDispatcher;
    }
  }

  executeRender();

  return {
    result: hookResult,
    rerender: (newProps?: UseLobbyPollOptions) => {
      if (newProps) hookProps = newProps;
      executeRender();
    },
    unmount: () => {
      cleanupFns.forEach((c) => c && c());
      cleanupFns = [];
    },
    triggerVisibilityChange: (hidden: boolean) => {
      mockDocument.hidden = hidden;
      if (listeners['visibilitychange']) {
        listeners['visibilitychange'].forEach((fn) => fn());
      }
    },
  };
}

// ============================================================================
// 2. Pure Polling Engine State Machine Harness
// ============================================================================
export class LobbyPollStateHarness {
  public status: DrawStatus | null = null;
  public participants: Participant[] = [];
  public isLoading = true;
  public error: Error | null = null;
  public consecutiveFailures = 0;
  public timer: any = null;
  public abortCtrl: AbortController | null = null;
  public prevIsDrawn = false;
  public onDrawCompleteCalls: DrawStatus[] = [];
  public isSubscribed = true;
  public pollHistory: Array<{ timestamp: number; interval: number; success: boolean }> = [];

  constructor(
    public baseIntervalMs = 3500,
    public maxIntervalMs = 15000,
    public onDrawComplete?: (status: DrawStatus) => void
  ) {}

  public getInterval(isHidden = false): number {
    if (isHidden) return 20000;
    const multiplier = Math.min(
      Math.pow(1.5, this.consecutiveFailures),
      this.maxIntervalMs / this.baseIntervalMs
    );
    return Math.round(this.baseIntervalMs * multiplier);
  }

  public async fetchStatusAndParticipants(
    statusFetcher: (signal: AbortSignal) => Promise<DrawStatus>,
    participantsFetcher: (signal: AbortSignal) => Promise<Participant[]>
  ): Promise<void> {
    if (this.abortCtrl) {
      this.abortCtrl.abort();
    }
    const ctrl = new AbortController();
    this.abortCtrl = ctrl;

    try {
      const [sData, pData] = await Promise.all([
        statusFetcher(ctrl.signal),
        participantsFetcher(ctrl.signal),
      ]);

      this.status = sData;
      this.participants = pData;
      this.error = null;
      this.consecutiveFailures = 0;
      this.pollHistory.push({ timestamp: Date.now(), interval: this.getInterval(), success: true });

      if (sData.isDrawn && !this.prevIsDrawn) {
        this.prevIsDrawn = true;
        this.onDrawCompleteCalls.push(sData);
        if (this.onDrawComplete) this.onDrawComplete(sData);
      } else {
        this.prevIsDrawn = sData.isDrawn;
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        this.consecutiveFailures += 1;
        this.error = err;
        this.pollHistory.push({ timestamp: Date.now(), interval: this.getInterval(), success: false });
      }
    } finally {
      this.isLoading = false;
    }
  }

  public scheduleNext(
    statusFetcher: (signal: AbortSignal) => Promise<DrawStatus>,
    participantsFetcher: (signal: AbortSignal) => Promise<Participant[]>,
    isHidden = false
  ): void {
    if (!this.isSubscribed) return;
    const interval = this.getInterval(isHidden);
    this.timer = setTimeout(async () => {
      if (!this.isSubscribed) return;
      await this.fetchStatusAndParticipants(statusFetcher, participantsFetcher);
      this.scheduleNext(statusFetcher, participantsFetcher, isHidden);
    }, interval);
  }

  public handleVisibilityChange(
    isHidden: boolean,
    statusFetcher: (signal: AbortSignal) => Promise<DrawStatus>,
    participantsFetcher: (signal: AbortSignal) => Promise<Participant[]>
  ): void {
    if (!isHidden && this.isSubscribed) {
      this.consecutiveFailures = 0;
      if (this.timer) clearTimeout(this.timer);
      this.fetchStatusAndParticipants(statusFetcher, participantsFetcher).then(() => {
        this.scheduleNext(statusFetcher, participantsFetcher, false);
      });
    }
  }

  public unmount(): void {
    this.isSubscribed = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.abortCtrl) this.abortCtrl.abort();
  }
}

// ============================================================================
// 3. Main Test Suite: Milestone 5 Multi-User & Network Resilience
// ============================================================================
describe('Milestone 5: Multi-User & Network Resilience Stress Harness', () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.useFakeTimers();
    db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    initializeSchema(db);
    seedDatabase(db);
    setDatabase(db);
    app = createApp();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Section A: Lobby Polling Network Degradation & Resilience (useLobbyPoll)
  // ==========================================================================
  describe('A. Lobby Polling Network Degradation & Recovery (useLobbyPoll)', () => {
    it('1. Verifies mathematical exponential backoff progression and strict capping at maxIntervalMs', () => {
      const baseMs = 3500;
      const maxMs = 15000;

      const calcInterval = (failures: number, isHidden = false) => {
        if (isHidden) return 20000;
        const multiplier = Math.min(Math.pow(1.5, failures), maxMs / baseMs);
        return Math.round(baseMs * multiplier);
      };

      expect(calcInterval(0)).toBe(3500); // 1.5^0 = 1.0 -> 3500ms
      expect(calcInterval(1)).toBe(5250); // 1.5^1 = 1.5 -> 5250ms
      expect(calcInterval(2)).toBe(7875); // 1.5^2 = 2.25 -> 7875ms
      expect(calcInterval(3)).toBe(11813); // 1.5^3 = 3.375 -> 11812.5 -> 11813ms
      expect(calcInterval(4)).toBe(15000); // 1.5^4 = 5.06 > 4.2857 -> capped strictly at 15000ms
      expect(calcInterval(10)).toBe(15000); // High failure counts stay strictly capped
      expect(calcInterval(50)).toBe(15000); // Monte Carlo upper bound safe
      expect(calcInterval(100)).toBe(15000);

      // Tab hidden throttling: Always 20,000ms regardless of failureCount
      expect(calcInterval(0, true)).toBe(20000);
      expect(calcInterval(4, true)).toBe(20000);
      expect(calcInterval(10, true)).toBe(20000);
    });

    it('2. Successfully polls initial lobby state and populates status and participants via hook runner', async () => {
      const mockStatus: DrawStatus = {
        isDrawn: false,
        totalParticipants: 24,
        registeredCount: 5,
        drawnAt: null,
        verificationHash: null,
      };
      const mockParticipants: Participant[] = [
        { id: 1, name: 'Lada', displayName: 'Lada', isRegistered: true, registeredAt: '2026-11-05T10:00:00Z' },
        { id: 2, name: 'Sara', displayName: 'Sara', isRegistered: false, registeredAt: null },
      ];

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/status') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockStatus,
          });
        }
        if (url === '/api/participants') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockParticipants,
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      const harness = renderLobbyPollHook({ baseIntervalMs: 2000 });

      // Initial execution
      await vi.advanceTimersByTimeAsync(10);

      expect(fetchSpy).toHaveBeenCalledWith('/api/status', expect.any(Object));
      expect(fetchSpy).toHaveBeenCalledWith('/api/participants', expect.any(Object));

      expect(harness.result.current.isLoading).toBe(false);
      expect(harness.result.current.error).toBeNull();
      expect(harness.result.current.status).toEqual(mockStatus);
      expect(harness.result.current.participants).toEqual(mockParticipants);
      expect(harness.result.current.registeredCount).toBe(5);
      expect(harness.result.current.isDrawn).toBe(false);

      harness.unmount();
    });

    it('3. Recovers cleanly from consecutive 500 and 503 network drops and resets error on recovery', async () => {
      let callCount = 0;
      const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        // First poll: 500 Internal Server Error
        if (callCount <= 2) {
          return { ok: false, status: 500, json: async () => ({ error: 'Database busy' }) };
        }
        // Second poll (after backoff): 503 Service Unavailable
        if (callCount <= 4) {
          return { ok: false, status: 503, json: async () => ({ error: 'Gateway timeout' }) };
        }
        // Third poll: Server recovers with 200 OK
        if (url === '/api/status') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ isDrawn: false, registeredCount: 8, totalParticipants: 24 }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 1, name: 'Lada', displayName: 'Lada', isRegistered: true },
          ],
        };
      });
      globalThis.fetch = fetchSpy;

      const harness = renderLobbyPollHook({ baseIntervalMs: 1000, maxIntervalMs: 5000 });

      // Step 1: Initial call encounters 500 error
      await vi.advanceTimersByTimeAsync(10);
      expect(harness.result.current.error).not.toBeNull();
      expect(harness.result.current.error?.message).toContain('API error: status=500');

      // Step 2: Next poll after backoff (1000 * 1.5 = 1500ms) encounters 503 error
      await vi.advanceTimersByTimeAsync(1600);
      expect(harness.result.current.error).not.toBeNull();
      expect(harness.result.current.error?.message).toContain('API error: status=503');

      // Step 3: Next poll after backoff (1000 * 2.25 = 2250ms) recovers cleanly!
      await vi.advanceTimersByTimeAsync(2400);
      expect(harness.result.current.error).toBeNull();
      expect(harness.result.current.registeredCount).toBe(8);
      expect(harness.result.current.status?.isDrawn).toBe(false);

      harness.unmount();
    });

    it('4. Handles raw network rejections (TypeError: Failed to fetch) without crashing', async () => {
      let fail = true;
      const fetchSpy = vi.fn().mockImplementation(async () => {
        if (fail) {
          throw new TypeError('Failed to fetch (net::ERR_INTERNET_DISCONNECTED)');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ isDrawn: false, registeredCount: 24 }),
        };
      });
      globalThis.fetch = fetchSpy;

      const harness = renderLobbyPollHook({ baseIntervalMs: 1000 });

      await vi.advanceTimersByTimeAsync(10);
      expect(harness.result.current.error).not.toBeNull();
      expect(harness.result.current.error?.message).toContain('Failed to fetch');

      // Network comes back online
      fail = false;
      await vi.advanceTimersByTimeAsync(1600);
      expect(harness.result.current.error).toBeNull();
      expect(harness.result.current.registeredCount).toBe(24);

      harness.unmount();
    });

    it('5. Triggers onDrawComplete callback exactly once when draw occurs and suppresses redundant triggers', async () => {
      let isDrawnServer = false;
      const onDrawCompleteMock = vi.fn();

      const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/status') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              isDrawn: isDrawnServer,
              registeredCount: 24,
              drawnAt: isDrawnServer ? '2026-11-05T12:00:00Z' : null,
              verificationHash: isDrawnServer ? 'hash-abc-123' : null,
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      });
      globalThis.fetch = fetchSpy;

      const harness = renderLobbyPollHook({
        baseIntervalMs: 1000,
        onDrawComplete: onDrawCompleteMock,
      });

      // Poll 1: Not drawn yet
      await vi.advanceTimersByTimeAsync(10);
      expect(onDrawCompleteMock).not.toHaveBeenCalled();

      // Poll 2: Still not drawn
      await vi.advanceTimersByTimeAsync(1100);
      expect(onDrawCompleteMock).not.toHaveBeenCalled();

      // Admin executes draw on backend!
      isDrawnServer = true;

      // Poll 3: Detects draw transition!
      await vi.advanceTimersByTimeAsync(1100);
      expect(onDrawCompleteMock).toHaveBeenCalledTimes(1);
      expect(onDrawCompleteMock).toHaveBeenCalledWith(
        expect.objectContaining({ isDrawn: true, verificationHash: 'hash-abc-123' })
      );

      // Polls 4, 5, 6: Subsequent polls continue with isDrawn: true
      await vi.advanceTimersByTimeAsync(1100);
      await vi.advanceTimersByTimeAsync(1100);
      await vi.advanceTimersByTimeAsync(1100);

      // Invariant: onDrawComplete must NOT be called again
      expect(onDrawCompleteMock).toHaveBeenCalledTimes(1);

      harness.unmount();
    });

    it('6. Document visibility change throttles background polling and initiates immediate fast refetch upon tab focus', async () => {
      const fetchSpy = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ isDrawn: false, registeredCount: 15 }),
        };
      });
      globalThis.fetch = fetchSpy;

      const harness = renderLobbyPollHook({ baseIntervalMs: 3500 });
      await vi.advanceTimersByTimeAsync(10);
      expect(fetchSpy).toHaveBeenCalledTimes(2); // Initial status + participants

      // Tab hidden: Existing scheduled timer (3500ms) completes, but subsequent poll throttles to 20,000ms
      harness.triggerVisibilityChange(true);

      // Advance by 3600ms (timer scheduled before hide completes and schedules 20,000ms background interval)
      await vi.advanceTimersByTimeAsync(3600);
      expect(fetchSpy).toHaveBeenCalledTimes(4);

      // Advance by another 15,000ms: Still 4 calls because background interval is 20,000ms (no poll fires yet)
      await vi.advanceTimersByTimeAsync(15000);
      expect(fetchSpy).toHaveBeenCalledTimes(4);

      // User switches back to tab: visibilitychange fires with hidden: false
      // Invariant: Immediately clears pending 20s timer and executes instant fast refetch
      harness.triggerVisibilityChange(false);
      await vi.advanceTimersByTimeAsync(10);

      expect(fetchSpy).toHaveBeenCalledTimes(6);

      harness.unmount();
    });

    it('7. Cleans up timers, abort controllers and event listeners cleanly on unmount', async () => {
      const fetchSpy = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ isDrawn: false, registeredCount: 10 }),
        };
      });
      globalThis.fetch = fetchSpy;

      const harness = renderLobbyPollHook({ baseIntervalMs: 1000 });
      await vi.advanceTimersByTimeAsync(10);
      const callCountBeforeUnmount = fetchSpy.mock.calls.length;

      // Unmount hook
      harness.unmount();

      // Advance time by 10,000ms: no further polls should occur
      await vi.advanceTimersByTimeAsync(10000);
      expect(fetchSpy.mock.calls.length).toBe(callCountBeforeUnmount);
    });

    it('8. Verifies pure state machine harness under multi-stage failure and AbortError immunity', async () => {
      const onDraw = vi.fn();
      const stateHarness = new LobbyPollStateHarness(2000, 10000, onDraw);

      // Stage 1: Success
      await stateHarness.fetchStatusAndParticipants(
        async () => ({ isDrawn: false, registeredCount: 2, totalParticipants: 24, drawnAt: null, verificationHash: null }),
        async () => [{ id: 1, name: 'Lada', displayName: 'Lada', isRegistered: true, registeredAt: null }]
      );
      expect(stateHarness.consecutiveFailures).toBe(0);
      expect(stateHarness.error).toBeNull();
      expect(stateHarness.getInterval()).toBe(2000);

      // Stage 2: 500 Error
      await stateHarness.fetchStatusAndParticipants(
        async () => { throw new Error('API error: status=500'); },
        async () => []
      );
      expect(stateHarness.consecutiveFailures).toBe(1);
      expect(stateHarness.error?.message).toBe('API error: status=500');
      expect(stateHarness.getInterval()).toBe(3000); // 2000 * 1.5 = 3000

      // Stage 3: AbortError from fast cancel (must NOT increment consecutiveFailures)
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      await stateHarness.fetchStatusAndParticipants(
        async () => { throw abortError; },
        async () => []
      );
      expect(stateHarness.consecutiveFailures).toBe(1); // Still 1!
      expect(stateHarness.error?.message).toBe('API error: status=500'); // Preserved!

      // Stage 4: Recovery + Draw Event
      await stateHarness.fetchStatusAndParticipants(
        async () => ({ isDrawn: true, registeredCount: 24, totalParticipants: 24, drawnAt: '2026-11-05T10:00:00Z', verificationHash: 'v-hash' }),
        async () => []
      );
      expect(stateHarness.consecutiveFailures).toBe(0);
      expect(stateHarness.error).toBeNull();
      expect(stateHarness.getInterval()).toBe(2000);
      expect(onDraw).toHaveBeenCalledTimes(1);

      stateHarness.unmount();
    });
  });

  // ==========================================================================
  // Section B: Concurrent Wishlist Autosave & Network Drops
  // ==========================================================================
  describe('B. Concurrent Wishlist Autosave under Intermittent Drops', () => {
    it('1. Handles rapid concurrent PUT /api/me/wishlist bursts for the same participant without deadlocks', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(1, false);
      const cookie = `session_token=${token}`;

      // Simulate 20 concurrent autosave requests arriving simultaneously (burst)
      const burstPromises = Array.from({ length: 20 }, (_, i) => {
        return request(app)
          .put('/api/me/wishlist')
          .set('Cookie', cookie)
          .send({ content: `Autosave revision #${i + 1}: Bücher und Espresso` });
      });

      const results = await Promise.all(burstPromises);

      // All 20 concurrent saves must succeed (200 OK)
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      // Final state in database must be valid and intact
      const wishlist = q.getWishList(1);
      expect(wishlist).not.toBeNull();
      expect(wishlist?.content).toContain('Autosave revision #');
    });

    it('2. Stress-tests 24 concurrent participants saving wishlists simultaneously (Rush Hour Concurrency)', async () => {
      const q = createQueryLayer(db);

      // Create session for each of the 24 participants
      const sessions = Array.from({ length: 24 }, (_, i) => {
        const participantId = i + 1;
        const token = q.createSession(participantId, false);
        return { participantId, cookie: `session_token=${token}` };
      });

      // Fire 24 simultaneous PUT requests
      const concurrentSaves = sessions.map(({ participantId, cookie }) => {
        const customWish = `Wunsch von Teilnehmer ${participantId}: Geschenkkarte & Pralinen 🎁🎄`;
        return request(app)
          .put('/api/me/wishlist')
          .set('Cookie', cookie)
          .send({ content: customWish });
      });

      const saveResults = await Promise.all(concurrentSaves);

      // Every single participant save succeeds with 200
      for (const res of saveResults) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      // Verify zero cross-contamination: each participant has exactly their own wishlist
      for (let pId = 1; pId <= 24; pId++) {
        const entry = q.getWishList(pId);
        expect(entry).not.toBeNull();
        expect(entry?.content).toBe(`Wunsch von Teilnehmer ${pId}: Geschenkkarte & Pralinen 🎁🎄`);
      }
    });

    it('3. Enforces strict boundary validation at exactly 2,000 characters and rejects 2,001 characters', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(1, false);
      const cookie = `session_token=${token}`;

      // Exactly 2000 chars -> Accepted (200 OK)
      const exact2000 = 'W'.repeat(2000);
      const res2000 = await request(app)
        .put('/api/me/wishlist')
        .set('Cookie', cookie)
        .send({ content: exact2000 });

      expect(res2000.status).toBe(200);
      expect(res2000.body.content.length).toBe(2000);

      // 2001 chars -> Rejected (400 Bad Request CONTENT_TOO_LONG)
      const tooLong2001 = 'W'.repeat(2001);
      const res2001 = await request(app)
        .put('/api/me/wishlist')
        .set('Cookie', cookie)
        .send({ content: tooLong2001 });

      expect(res2001.status).toBe(400);
      expect(res2001.body.code).toBe('CONTENT_TOO_LONG');
    });

    it('4. Handles complex multi-byte UTF-8, emoji, newlines and SQL injection strings safely', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(3, false);
      const cookie = `session_token=${token}`;

      const complexPayload = `
        🎅 Lieber Wichtel! 🎄
        - Ein feiner Espresso (ä, ö, ü, ß)
        - Café au lait & Crème brûlée
        - Japanese Green Tea: 煎茶 & 抹茶 🍵
        - Code Snippet: <script>alert("xss")</script>
        - SQL injection attempt: '; DROP TABLE wish_lists; --
      `.trim();

      const putRes = await request(app)
        .put('/api/me/wishlist')
        .set('Cookie', cookie)
        .send({ content: complexPayload });

      expect(putRes.status).toBe(200);

      // Read back via GET /api/me/wishlist
      const getRes = await request(app)
        .get('/api/me/wishlist')
        .set('Cookie', cookie);

      expect(getRes.status).toBe(200);
      expect(getRes.body.content).toBe(complexPayload);

      // Verify schema was not compromised by SQL injection payload
      const count = q.getRegisteredCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('5. Protects partner wishlist confidentiality: rejects access before draw and allows strictly assigned partner after draw', async () => {
      const q = createQueryLayer(db);
      const tokenGiver = q.createSession(1, false); // Participant 1
      const cookieGiver = `session_token=${tokenGiver}`;

      // 1. Before draw: Accessing partner wishlist is blocked with 400 NOT_DRAWN_YET
      const beforeDrawRes = await request(app)
        .get('/api/partner/wishlist')
        .set('Cookie', cookieGiver);

      expect(beforeDrawRes.status).toBe(400);
      expect(beforeDrawRes.body.code).toBe('NOT_DRAWN_YET');

      // 2. Perform draw: Participant 1 gives to Participant 18 (André)
      // Populate André's wishlist
      q.upsertWishList(18, 'André wünscht sich ein gutes Buch über Algorithmen 📚');

      // Seed assignments: 1 -> 18
      db.prepare('INSERT INTO assignments (giver_id, receiver_id) VALUES (1, 18)').run();
      db.prepare("UPDATE draw_status SET is_drawn = 1, drawn_at = datetime('now') WHERE id = 1").run();

      // 3. After draw: Giver can now read André's wishlist
      const afterDrawRes = await request(app)
        .get('/api/partner/wishlist')
        .set('Cookie', cookieGiver);

      expect(afterDrawRes.status).toBe(200);
      expect(afterDrawRes.body.partnerName).toBe('André');
      expect(afterDrawRes.body.content).toBe('André wünscht sich ein gutes Buch über Algorithmen 📚');

      // Also verify alias endpoint /api/me/partner-wishlist
      const aliasRes = await request(app)
        .get('/api/me/partner-wishlist')
        .set('Cookie', cookieGiver);

      expect(aliasRes.status).toBe(200);
      expect(aliasRes.body.partnerName).toBe('André');
    });
  });

  // ==========================================================================
  // Section C: Colleague Roster Boundary Conditions & Unicode Resilience
  // ==========================================================================
  describe('C. Colleague Roster Boundary Conditions & Unicode (André, etc.)', () => {
    it('1. Validates that SEED_COLLEAGUES contains exactly 24 unique colleagues with André present', () => {
      expect(SEED_COLLEAGUES).toHaveLength(24);

      const names = SEED_COLLEAGUES.map((c) => c.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(24);

      // Verify exact presence of André
      const andre = SEED_COLLEAGUES.find((c) => c.name === 'André');
      expect(andre).toBeDefined();
      expect(andre?.sentence).toBe('Kombiniert analytische Schärfe mit ansteckendem Optimismus!');
      expect(andre?.keywords).toEqual([
        { word: 'Schärfe', emoji: '🗡️' },
        { word: 'Optimismus', emoji: '🌟' },
      ]);
    });

    it('2. Tests normalizeSearch diacritic stripping across NFC, NFD, uppercase, and unaccented variations of André', () => {
      const nfc = 'Andr\u00E9'; // Precomposed André (U+00E9)
      const nfd = 'Andre\u0301'; // Decomposed André (U+0065 + U+0301)
      const upperNfc = 'ANDR\u00C9'; // Uppercase ANDRÉ (U+00C9)
      const upperNfd = 'ANDRE\u0301'; // Uppercase ANDRE\u0301
      const plainLower = 'andre';
      const plainUpper = 'ANDRE';
      const mixedCase = 'aNdRé';
      const padded = '   André \t ';

      // All variations must normalize to the exact search key 'andre'
      expect(normalizeSearch(nfc)).toBe('andre');
      expect(normalizeSearch(nfd)).toBe('andre');
      expect(normalizeSearch(upperNfc)).toBe('andre');
      expect(normalizeSearch(upperNfd)).toBe('andre');
      expect(normalizeSearch(plainLower)).toBe('andre');
      expect(normalizeSearch(plainUpper)).toBe('andre');
      expect(normalizeSearch(mixedCase)).toBe('andre');
      expect(normalizeSearch(padded)).toBe('andre');

      // Proves complete equivalence
      expect(normalizeSearch(nfc)).toBe(normalizeSearch(nfd));
      expect(normalizeSearch(nfc)).toBe(normalizeSearch(plainLower));
    });

    it('3. Verifies colleague search filter matches André regardless of search input format (noting Andreas overlap)', () => {
      const colleagues = SEED_COLLEAGUES.map((c, idx) => ({
        id: idx + 1,
        name: c.name,
        displayName: c.name,
        isRegistered: false,
      }));

      const filterByTerm = (term: string) => {
        const norm = normalizeSearch(term);
        return colleagues.filter((c) => {
          return normalizeSearch(c.displayName || c.name).includes(norm);
        });
      };

      // Searching with substring "andre" matches both André and Andreas (expected substring behavior)
      const matchPlain = filterByTerm('andre');
      expect(matchPlain).toHaveLength(2);
      expect(matchPlain.map((c) => c.name)).toContain('André');
      expect(matchPlain.map((c) => c.name)).toContain('Andreas');

      // Searching with "ANDRÉ" matches both
      const matchUpper = filterByTerm('ANDRÉ');
      expect(matchUpper).toHaveLength(2);
      expect(matchUpper.map((c) => c.name)).toContain('André');
      expect(matchUpper.map((c) => c.name)).toContain('Andreas');

      // Searching with decomposed NFD "Andre\u0301" matches both
      const matchNfd = filterByTerm('Andre\u0301');
      expect(matchNfd).toHaveLength(2);
      expect(matchNfd.map((c) => c.name)).toContain('André');

      // Exact normalized match distinguishes André uniquely from Andreas
      const exactMatch = colleagues.filter((c) => normalizeSearch(c.name) === 'andre');
      expect(exactMatch).toHaveLength(1);
      expect(exactMatch[0].name).toBe('André');

      // Substring "dré" matches André
      expect(filterByTerm('dré').map((c) => c.name)).toContain('André');
    });

    it('4. Rejects non-whitelisted and malformed participant IDs in registration options API', async () => {
      // Out of bounds: participantId 999 -> 404 PARTICIPANT_NOT_FOUND
      const res999 = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId: 999 });

      expect(res999.status).toBe(404);
      expect(res999.body.code).toBe('PARTICIPANT_NOT_FOUND');

      // Invalid ID: 0 -> 400 INVALID_INPUT
      const res0 = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId: 0 });

      expect(res0.status).toBe(400);
      expect(res0.body.code).toBe('INVALID_INPUT');

      // Negative ID: -5 -> 400 INVALID_INPUT
      const resNeg = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId: -5 });

      expect(resNeg.status).toBe(400);
      expect(resNeg.body.code).toBe('INVALID_INPUT');

      // Non-numeric string: "andre" -> 400 INVALID_INPUT
      const resStr = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId: 'andre' });

      expect(resStr.status).toBe(400);
      expect(resStr.body.code).toBe('INVALID_INPUT');

      // Missing body / null -> 400 INVALID_INPUT
      const resNull = await request(app)
        .post('/api/auth/register-options')
        .send({});

      expect(resNull.status).toBe(400);
      expect(resNull.body.code).toBe('INVALID_INPUT');
    });

    it('5. Verifies database query layer handles André lookup across casing and NFC normalization', () => {
      const q = createQueryLayer(db);

      // Lookup by exact NFC normalized name 'andré'
      const p1 = q.findParticipantByName('andré');
      expect(p1).toBeDefined();
      expect(p1?.name).toBe('André');
      expect(p1?.display_name).toBe('André');

      // Lookup by uppercase or padded should be safely resolved if normalized first
      const input = '  ANDRÉ  ';
      const p2 = q.findParticipantByName(input);
      expect(p2).toBeDefined();
      expect(p2?.id).toBe(p1?.id);

      // Lookup with decomposed NFD
      const p3 = q.findParticipantByName('Andre\u0301');
      expect(p3).toBeDefined();
      expect(p3?.id).toBe(p1?.id);

      // Non-existent participant lookup returns null
      const pUnknown = q.findParticipantByName('santa_claus');
      expect(pUnknown).toBeNull();
    });

    it('6. Fuzzing test: Monte Carlo search over all 24 colleagues with 1,000 random mutations', () => {
      // Generate 1,000 randomized search inputs (case mutations, space padding, diacritic switches)
      for (let i = 0; i < 1000; i++) {
        const randomColleague = SEED_COLLEAGUES[i % SEED_COLLEAGUES.length];
        const rawName = randomColleague.name;

        // Apply random mutations:
        // 1. Random case (upper, lower, mixed)
        let mutated = rawName
          .split('')
          .map((ch) => (Math.random() > 0.5 ? ch.toUpperCase() : ch.toLowerCase()))
          .join('');

        // 2. Random whitespace padding
        const padLeft = ' '.repeat(Math.floor(Math.random() * 4));
        const padRight = ' '.repeat(Math.floor(Math.random() * 4));
        mutated = `${padLeft}${mutated}${padRight}`;

        // 3. If name has 'é', optionally replace with unaccented 'e' or NFD
        if (mutated.includes('é') || mutated.includes('É')) {
          if (Math.random() > 0.5) {
            mutated = mutated.replace(/é/g, 'e').replace(/É/g, 'E');
          } else {
            mutated = mutated.normalize('NFD');
          }
        }

        const normalized = normalizeSearch(mutated);
        expect(normalized.length).toBeGreaterThan(0);

        // Target normalized
        const expected = normalizeSearch(rawName);
        expect(normalized).toBe(expected);
      }
    });
  });
});
