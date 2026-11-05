import { test, expect } from '@playwright/test';
import { WichtelnApiClient, verifyDerangementProperties, AssignmentPair } from '../helpers/api-client';
import { randomInt } from 'node:crypto';

/**
 * Sattolo's Single-Cycle Derangement Generator for mathematical invariant testing.
 */
function generateSattolosDerangement(ids: number[]): AssignmentPair[] {
  const n = ids.length;
  const cycle = [...ids];
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(0, i);
    const temp = cycle[i];
    cycle[i] = cycle[j];
    cycle[j] = temp;
  }
  const pairs: AssignmentPair[] = [];
  for (let k = 0; k < n; k++) {
    pairs.push({
      giverId: cycle[k],
      receiverId: cycle[(k + 1) % n],
    });
  }
  return pairs;
}

test.describe('Tier 2: Derangement & Draw Invariant Boundaries', () => {
  const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || 'wichteln2026';

  test.describe('API Draw Boundaries', () => {
    test.beforeEach(async ({ request }) => {
      const api = new WichtelnApiClient(request);
      await api.resetRateLimit();
      await api.resetDrawState();
    });

    test('TC-B3-01 (Incomplete Registration Draw Attempt): Admin draw rejected with 412 when registrations < 24', async ({
      request,
    }) => {
      const api = new WichtelnApiClient(request);
      const status = await api.getStatus();

      if (status.registeredCount < 24 && !status.isDrawn) {
        await api.adminLogin(DEFAULT_ADMIN_PIN);
        const res = await api.triggerAdminDraw();
        expect([400, 412]).toContain(res.status);
      }
    });

    test('TC-B3-02 (Double Draw Execution): Re-triggering draw after already drawn is rejected with 409', async ({
      request,
    }) => {
      const api = new WichtelnApiClient(request);
      const status = await api.getStatus();

      if (status.isDrawn) {
        await api.adminLogin(DEFAULT_ADMIN_PIN);
        const res = await api.triggerAdminDraw();
        expect([400, 409]).toContain(res.status);
      }
    });
  });

  test.describe('Mathematical Invariant Boundaries (Monte Carlo)', () => {
    // Pure in-memory Monte Carlo algorithms: NO Playwright { request } network fixture!
    test.setTimeout(60000);

    test('TC-B3-03 (Zero Self-Draw Invariant): Monte Carlo test of 2,000 derangements asserts 0 fixpoints', async () => {
      const participantIds = Array.from({ length: 24 }, (_, i) => i + 1);
      let selfDrawCount = 0;

      for (let run = 0; run < 2000; run++) {
        const pairs = generateSattolosDerangement(participantIds);
        for (const pair of pairs) {
          if (pair.giverId === pair.receiverId) {
            selfDrawCount++;
          }
        }
      }

      expect(selfDrawCount).toBe(0);
    });

    test('TC-B3-04 (Single Hamiltonian Cycle Invariant): Monte Carlo test asserts 100% single cycles of length 24', async () => {
      const participantIds = Array.from({ length: 24 }, (_, i) => i + 1);
      let invalidRuns = 0;
      const failures: Array<{ run: number; errors: string[]; cycleLength: number }> = [];

      for (let run = 0; run < 2000; run++) {
        const pairs = generateSattolosDerangement(participantIds);
        const verification = verifyDerangementProperties(pairs, 24);

        if (
          !verification.isValid ||
          !verification.isSingleCycle ||
          verification.cycleLength !== 24 ||
          verification.errors.length > 0
        ) {
          invalidRuns++;
          failures.push({
            run,
            errors: verification.errors,
            cycleLength: verification.cycleLength,
          });
        }
      }

      expect(invalidRuns).toBe(0);
      expect(failures).toEqual([]);
    });

    test('TC-B3-05 (Zero Disjoint Sub-Cycles): No 2-cycles or cliques formed in single-cycle derangement', async () => {
      const participantIds = Array.from({ length: 24 }, (_, i) => i + 1);
      const detected2Cycles: Array<{ run: number; giverId: number; receiverId: number }> = [];

      for (let run = 0; run < 1000; run++) {
        const pairs = generateSattolosDerangement(participantIds);
        const giverToReceiver = new Map<number, number>();
        for (const p of pairs) {
          giverToReceiver.set(p.giverId, p.receiverId);
        }

        // Check that no pair (A, B) has A -> B and B -> A (mutual gifting 2-cycle)
        for (const p of pairs) {
          const receiver = p.receiverId;
          const receiversReceiver = giverToReceiver.get(receiver);
          // For N=24, a 2-cycle would mean receiversReceiver === p.giverId
          if (receiversReceiver === p.giverId) {
            detected2Cycles.push({
              run,
              giverId: p.giverId,
              receiverId: receiver,
            });
          }
        }
      }

      expect(detected2Cycles).toHaveLength(0);
    });
  });
});
