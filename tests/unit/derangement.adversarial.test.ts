import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  generateSingleCycleDerangement,
  computeVerificationHash,
  verifyAssignmentsIntegrity,
  AssignmentPair,
} from '../../server/services/derangement.service.js';

describe('Adversarial & Empirical Stress Tests for Single-Cycle Derangement', () => {
  const PARTICIPANTS_24 = Array.from({ length: 24 }, (_, i) => i + 1);

  describe('Adversarial Input & Boundary Conditions', () => {
    it('rejects empty arrays (n = 0)', () => {
      expect(() => generateSingleCycleDerangement([])).toThrow(/at least 2/i);
    });

    it('rejects single-element arrays (n = 1)', () => {
      expect(() => generateSingleCycleDerangement([42])).toThrow(/at least 2/i);
    });

    it('correctly handles n = 2 derangement', () => {
      for (let i = 0; i < 50; i++) {
        const result = generateSingleCycleDerangement([10, 20]);
        expect(result.pairs).toHaveLength(2);
        const map = new Map(result.pairs.map((p) => [p.giver_id, p.receiver_id]));
        expect(map.get(10)).toBe(20);
        expect(map.get(20)).toBe(10);
      }
    });

    it('handles n = 3 with uniform distribution over both 3-cycles', () => {
      // For n = 3, there are only (3-1)! = 2 possible single cycles:
      // Cycle A: 1 -> 2 -> 3 -> 1
      // Cycle B: 1 -> 3 -> 2 -> 1
      let countA = 0;
      let countB = 0;
      const iterations = 2000;

      for (let i = 0; i < iterations; i++) {
        const result = generateSingleCycleDerangement([1, 2, 3]);
        const map = new Map(result.pairs.map((p) => [p.giver_id, p.receiver_id]));
        if (map.get(1) === 2 && map.get(2) === 3 && map.get(3) === 1) {
          countA++;
        } else if (map.get(1) === 3 && map.get(3) === 2 && map.get(2) === 1) {
          countB++;
        } else {
          throw new Error(`Unexpected cycle structure: ${JSON.stringify(result.pairs)}`);
        }
      }

      expect(countA + countB).toBe(iterations);
      // Both should be ~1000 with binomial variance (p = 0.5, sigma = sqrt(2000 * 0.25) ~ 22.36)
      // Assert within 4 sigma (|count - 1000| < 90)
      expect(Math.abs(countA - 1000)).toBeLessThan(90);
      expect(Math.abs(countB - 1000)).toBeLessThan(90);
    });

    it('rejects duplicate participant IDs', () => {
      expect(() => generateSingleCycleDerangement([1, 1])).toThrow(/distinct/i);
      expect(() => generateSingleCycleDerangement([1, 2, 3, 4, 3, 5])).toThrow(/distinct/i);
      expect(() => generateSingleCycleDerangement([99, 99, 99])).toThrow(/distinct/i);
    });

    it('handles negative IDs, zero, and large safe integers correctly', () => {
      const exoticIds = [-1000, 0, 42, Number.MAX_SAFE_INTEGER, -1];
      const result = generateSingleCycleDerangement(exoticIds);
      expect(result.pairs).toHaveLength(5);

      const givers = new Set(result.pairs.map((p) => p.giver_id));
      const receivers = new Set(result.pairs.map((p) => p.receiver_id));
      expect(givers.size).toBe(5);
      expect(receivers.size).toBe(5);

      for (const p of result.pairs) {
        expect(p.giver_id).not.toBe(p.receiver_id);
      }
    });

    it('does NOT mutate the input array (pure immutability)', () => {
      const original = [10, 20, 30, 40, 50];
      const copy = [...original];
      generateSingleCycleDerangement(original);
      expect(original).toEqual(copy);
    });

    it('operates safely on Object.freeze() input arrays', () => {
      const frozen = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(() => generateSingleCycleDerangement(frozen as unknown as number[])).not.toThrow();
    });

    it('scales efficiently to N = 1,000 participants', () => {
      const largeList = Array.from({ length: 1000 }, (_, i) => i + 1);
      const start = performance.now();
      const result = generateSingleCycleDerangement(largeList);
      const elapsed = performance.now() - start;

      expect(result.pairs).toHaveLength(1000);
      expect(elapsed).toBeLessThan(100); // Should run in < 100ms
      // Verify single cycle for N=1000
      const map = new Map(result.pairs.map((p) => [p.giver_id, p.receiver_id]));
      let curr = 1;
      let count = 0;
      const visited = new Set<number>();
      while (!visited.has(curr)) {
        visited.add(curr);
        curr = map.get(curr)!;
        count++;
      }
      expect(count).toBe(1000);
      expect(curr).toBe(1);
    });
  });

  describe('Empirical Monte Carlo Stress Test (23,000 Iterations for N = 24)', () => {
    // 23,000 iterations:
    // - Guaranteed >= 10,000 iterations as required by dispatch.
    // - Exactly 1000 * (24 - 1), yielding theoretical integer expectation E = 1,000 per off-diagonal edge.
    const ITERATIONS = 23000;

    it(
      'proves zero fixed points, bijectivity, and single Hamiltonian cycles in all 23,000 iterations',
      () => {
        let fixedPointViolations = 0;
        let bijectivityViolations = 0;
        let subcycleViolations = 0;
        let reciprocityViolations = 0; // In single cycle, (A -> B and B -> A) must NEVER happen
        let hashVerificationFailures = 0;

        // Track edge frequencies for uniformity check
        // 24 x 24 matrix (1-indexed, using indices 1..24)
        const edgeMatrix: number[][] = Array.from({ length: 25 }, () =>
          new Array(25).fill(0)
        );

        for (let iter = 0; iter < ITERATIONS; iter++) {
          const result = generateSingleCycleDerangement(PARTICIPANTS_24);
          const pairs = result.pairs;

          // 1. Check size & zero fixed points
          if (pairs.length !== 24) {
            bijectivityViolations++;
          }

          const map = new Map<number, number>();
          for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
            const p = pairs[pIdx];
            if (p.giver_id === p.receiver_id) {
              fixedPointViolations++;
            }
            map.set(p.giver_id, p.receiver_id);
            edgeMatrix[p.giver_id][p.receiver_id]++;
          }

          // 2. Check bijectivity
          if (map.size !== 24) {
            bijectivityViolations++;
          }
          const receiverSet = new Set(pairs.map((p) => p.receiver_id));
          if (receiverSet.size !== 24) {
            bijectivityViolations++;
          }

          // 3. Check single Hamiltonian cycle from ALL 24 starting positions
          // Every participant should traverse all 24 colleagues before returning
          for (let startId = 1; startId <= 24; startId++) {
            let curr = startId;
            let steps = 0;
            const visited = new Set<number>();

            while (!visited.has(curr) && steps <= 25) {
              visited.add(curr);
              curr = map.get(curr)!;
              steps++;
            }

            if (steps !== 24 || curr !== startId || visited.size !== 24) {
              subcycleViolations++;
              break;
            }
          }

          // 4. Check zero 2-cycles (A -> B and B -> A)
          for (const [giver, receiver] of map.entries()) {
            if (map.get(receiver) === giver) {
              reciprocityViolations++;
            }
          }

          // 5. Check verification hash integrity
          // To keep test runtime fast, spot-check hash integrity every 50 iterations
          if (iter % 50 === 0) {
            const isValid = verifyAssignmentsIntegrity(result.pairs, result.verificationHash);
            if (!isValid) {
              hashVerificationFailures++;
            }
          }
        }

        // Assert strictly zero violations across all iterations
        expect(fixedPointViolations).toBe(0);
        expect(bijectivityViolations).toBe(0);
        expect(subcycleViolations).toBe(0);
        expect(reciprocityViolations).toBe(0);
        expect(hashVerificationFailures).toBe(0);

        // Uniformity check on edge frequencies:
        // Theoretical expectation for each off-diagonal edge: E = 23000 / 23 = 1000
        // Diagonal must be strictly 0
        for (let i = 1; i <= 24; i++) {
          expect(edgeMatrix[i][i]).toBe(0);
        }

        // Chi-Square goodness-of-fit test:
        // Total off-diagonal cells = 24 * 23 = 552
        // E = 1000
        // Variance for binomial B(23000, 1/23): sigma = sqrt(23000 * (1/23) * (22/23)) ~ 30.93
        let chiSquare = 0;
        let minCount = Infinity;
        let maxCount = -Infinity;

        for (let i = 1; i <= 24; i++) {
          for (let j = 1; j <= 24; j++) {
            if (i === j) continue;
            const count = edgeMatrix[i][j];
            if (count < minCount) minCount = count;
            if (count > maxCount) maxCount = count;
            const diff = count - 1000;
            chiSquare += (diff * diff) / 1000;
          }
        }

        // Degrees of freedom for 24x24 permutation matrix: (24 - 1) * (24 - 2) = 506
        // For 506 DOF, mean is 506, std dev is sqrt(2 * 506) ~ 31.81.
        // Critical value for alpha = 0.001 is ~614.
        // Lower critical value for alpha = 0.001 is ~405.
        // Assert chiSquare is within normal probabilistic distribution (390 < chiSquare < 640).
        expect(chiSquare).toBeGreaterThan(380);
        expect(chiSquare).toBeLessThan(650);

        // Individual cell counts should not diverge beyond ~6 standard deviations (1000 +/- 190)
        expect(minCount).toBeGreaterThan(800);
        expect(maxCount).toBeLessThan(1200);
      },
      30000 // 30s timeout
    );
  });

  describe('Cryptographic Hash Robustness & Tamper Resistance', () => {
    it('detects single-character tamper in hash', () => {
      const result = generateSingleCycleDerangement(PARTICIPANTS_24);
      const hash = result.verificationHash;
      const tamperedChar = hash[0] === 'a' ? 'b' : 'a';
      const tamperedHash = tamperedChar + hash.slice(1);

      expect(verifyAssignmentsIntegrity(result.pairs, tamperedHash)).toBe(false);
    });

    it('detects partner swapping tamper', () => {
      const result = generateSingleCycleDerangement(PARTICIPANTS_24);
      // Tamper: swap receivers of pair 0 and pair 1
      const tamperedPairs = result.pairs.map((p) => ({ ...p }));
      const temp = tamperedPairs[0].receiver_id;
      tamperedPairs[0].receiver_id = tamperedPairs[1].receiver_id;
      tamperedPairs[1].receiver_id = temp;

      expect(verifyAssignmentsIntegrity(tamperedPairs, result.verificationHash)).toBe(false);
    });

    it('rejects invalid hash inputs gracefully', () => {
      const result = generateSingleCycleDerangement(PARTICIPANTS_24);
      expect(verifyAssignmentsIntegrity(result.pairs, '')).toBe(false);
      expect(verifyAssignmentsIntegrity(result.pairs, 'too-short')).toBe(false);
      expect(verifyAssignmentsIntegrity(result.pairs, null as unknown as string)).toBe(false);
      expect(verifyAssignmentsIntegrity(result.pairs, undefined as unknown as string)).toBe(false);
      expect(verifyAssignmentsIntegrity(result.pairs, 'z'.repeat(64))).toBe(false);
    });
  });
});
