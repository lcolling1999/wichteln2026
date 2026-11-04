import { describe, it, expect } from 'vitest';
import {
  generateSingleCycleDerangement,
  computeVerificationHash,
  verifyAssignmentsIntegrity,
  AssignmentPair,
} from '../../server/services/derangement.service.js';

describe('Single-Cycle Derangement Algorithm Unit Tests', () => {
  const PARTICIPANTS_24 = Array.from({ length: 24 }, (_, i) => i + 1);

  describe('Boundary & Input Validation', () => {
    it('throws when participant count is less than 2', () => {
      expect(() => generateSingleCycleDerangement([])).toThrow(/at least 2/i);
      expect(() => generateSingleCycleDerangement([1])).toThrow(/at least 2/i);
    });

    it('throws when participant IDs contain duplicates', () => {
      expect(() => generateSingleCycleDerangement([1, 2, 2])).toThrow(/distinct/i);
      expect(() => generateSingleCycleDerangement([5, 5])).toThrow(/distinct/i);
    });

    it('correctly deranges minimal group of N = 2', () => {
      const result = generateSingleCycleDerangement([101, 102]);
      expect(result.pairs).toHaveLength(2);
      expect(result.pairs).toEqual(
        expect.arrayContaining([
          { giver_id: 101, receiver_id: 102 },
          { giver_id: 102, receiver_id: 101 },
        ])
      );
    });
  });

  describe('Mathematical Properties for N = 24 Colleagues', () => {
    it('generates exactly 24 assignment pairs with zero self-draws', () => {
      const { pairs } = generateSingleCycleDerangement(PARTICIPANTS_24);
      expect(pairs).toHaveLength(24);

      for (const pair of pairs) {
        expect(pair.giver_id).not.toBe(pair.receiver_id);
      }
    });

    it('guarantees bijectivity (every colleague gives once and receives once)', () => {
      const { pairs } = generateSingleCycleDerangement(PARTICIPANTS_24);
      const givers = new Set(pairs.map((p) => p.giver_id));
      const receivers = new Set(pairs.map((p) => p.receiver_id));

      expect(givers.size).toBe(24);
      expect(receivers.size).toBe(24);
      for (let id = 1; id <= 24; id++) {
        expect(givers.has(id)).toBe(true);
        expect(receivers.has(id)).toBe(true);
      }
    });

    it('guarantees a single Hamiltonian cycle of length 24 with 0 sub-cycles', () => {
      const { pairs } = generateSingleCycleDerangement(PARTICIPANTS_24);
      const map = new Map<number, number>();
      for (const p of pairs) {
        map.set(p.giver_id, p.receiver_id);
      }

      const start = PARTICIPANTS_24[0];
      const visited = new Set<number>();
      let curr = start;

      while (!visited.has(curr)) {
        visited.add(curr);
        curr = map.get(curr)!;
      }

      // Returned to start after visiting all 24 nodes
      expect(curr).toBe(start);
      expect(visited.size).toBe(24);
    });
  });

  describe('Monte Carlo Empirical Test (1,000 Iterations)', () => {
    it('passes all derangement and single-cycle invariants across 1,000 iterations', () => {
      const iterations = 1000;
      let totalSelfDraws = 0;
      let nonBijectiveCount = 0;
      let subCycleCount = 0;

      for (let run = 0; run < iterations; run++) {
        const { pairs } = generateSingleCycleDerangement(PARTICIPANTS_24);

        // Check self-draws
        for (const p of pairs) {
          if (p.giver_id === p.receiver_id) totalSelfDraws++;
        }

        // Check bijectivity
        const givers = new Set(pairs.map((p) => p.giver_id));
        const receivers = new Set(pairs.map((p) => p.receiver_id));
        if (givers.size !== 24 || receivers.size !== 24) {
          nonBijectiveCount++;
        }

        // Check cycle length
        const map = new Map<number, number>();
        for (const p of pairs) {
          map.set(p.giver_id, p.receiver_id);
        }

        let curr = PARTICIPANTS_24[0];
        let steps = 0;
        const visited = new Set<number>();

        while (!visited.has(curr) && steps < 30) {
          visited.add(curr);
          curr = map.get(curr)!;
          steps++;
        }

        if (visited.size !== 24 || curr !== PARTICIPANTS_24[0]) {
          subCycleCount++;
        }
      }

      expect(totalSelfDraws).toBe(0);
      expect(nonBijectiveCount).toBe(0);
      expect(subCycleCount).toBe(0);
    });
  });

  describe('Cryptographic SHA-256 Verification Hash', () => {
    it('generates a 64-character hexadecimal SHA-256 string', () => {
      const { verificationHash } = generateSingleCycleDerangement(PARTICIPANTS_24);
      expect(verificationHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is strictly deterministic regardless of in-memory pair ordering', () => {
      const pairs: AssignmentPair[] = [
        { giver_id: 2, receiver_id: 3 },
        { giver_id: 1, receiver_id: 2 },
        { giver_id: 3, receiver_id: 1 },
      ];
      const reversedPairs = [...pairs].reverse();

      const hash1 = computeVerificationHash(pairs);
      const hash2 = computeVerificationHash(reversedPairs);
      expect(hash1).toBe(hash2);
    });

    it('is sensitive to tamper (modifying any pairing produces a different hash)', () => {
      const pairs: AssignmentPair[] = [
        { giver_id: 1, receiver_id: 2 },
        { giver_id: 2, receiver_id: 3 },
        { giver_id: 3, receiver_id: 1 },
      ];
      const tamperedPairs: AssignmentPair[] = [
        { giver_id: 1, receiver_id: 3 },
        { giver_id: 2, receiver_id: 2 }, // Tampered
        { giver_id: 3, receiver_id: 1 },
      ];

      const originalHash = computeVerificationHash(pairs);
      const tamperedHash = computeVerificationHash(tamperedPairs);
      expect(originalHash).not.toBe(tamperedHash);
      expect(verifyAssignmentsIntegrity(tamperedPairs, originalHash)).toBe(false);
      expect(verifyAssignmentsIntegrity(pairs, originalHash)).toBe(true);
    });
  });
});
