import crypto from 'node:crypto';
import {
  generateSingleCycleDerangement,
  computeVerificationHash,
  verifyAssignmentsIntegrity,
  AssignmentPair,
} from '../server/services/derangement.service.js';

interface EmpiricalResults {
  iterations: number;
  totalPairingsEvaluated: number;
  fixedPointViolations: number;
  bijectivityViolations: number;
  subcycleViolations: number;
  reciprocalViolations: number;
  threeCycleViolations: number;
  cycleLengthDistribution: Record<number, number>;
  uniquePermutationsCount: number;
  hashCollisions: number;
  hashIntegrityChecksPassed: number;
  hashIntegrityChecksFailed: number;
  chiSquare: number;
  degreesOfFreedom: number;
  chiSquarePerDof: number;
  edgeCoverage: number; // percentage of off-diagonal edges seen at least once
  minEdgeCount: number;
  maxEdgeCount: number;
  expectedEdgeCount: number;
  elapsedMs: number;
  opsPerSec: number;
  edgeCasesResults: Record<string, boolean>;
}

export function runEmpiricalHarness(iterations: number = 100000): EmpiricalResults {
  const PARTICIPANTS_24 = Array.from({ length: 24 }, (_, i) => i + 1);
  const totalPairings = iterations * 24;

  let fixedPointViolations = 0;
  let bijectivityViolations = 0;
  let subcycleViolations = 0;
  let reciprocalViolations = 0;
  let threeCycleViolations = 0;
  let hashIntegrityChecksPassed = 0;
  let hashIntegrityChecksFailed = 0;

  const cycleLengthDistribution: Record<number, number> = {};
  const seenHashes = new Set<string>();
  let hashCollisions = 0;

  // 25x25 matrix for 1-based indexing (1..24)
  const edgeMatrix: number[][] = Array.from({ length: 25 }, () => new Array(25).fill(0));

  const start = performance.now();

  for (let iter = 0; iter < iterations; iter++) {
    const result = generateSingleCycleDerangement(PARTICIPANTS_24);
    const pairs = result.pairs;

    // Check size
    if (pairs.length !== 24) {
      bijectivityViolations++;
    }

    const giverSet = new Set<number>();
    const receiverSet = new Set<number>();
    const map = new Map<number, number>();

    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];

      // 1. Zero self-assignment check
      if (p.giver_id === p.receiver_id) {
        fixedPointViolations++;
      }

      giverSet.add(p.giver_id);
      receiverSet.add(p.receiver_id);
      map.set(p.giver_id, p.receiver_id);

      // Track edge
      edgeMatrix[p.giver_id][p.receiver_id]++;
    }

    // 2. Bijectivity check
    if (giverSet.size !== 24 || receiverSet.size !== 24) {
      bijectivityViolations++;
    }

    // 3. Single Hamiltonian Cycle check from all starting nodes
    for (let startNode = 1; startNode <= 24; startNode++) {
      let curr = startNode;
      let len = 0;
      const visited = new Set<number>();

      while (!visited.has(curr) && len <= 25) {
        visited.add(curr);
        curr = map.get(curr)!;
        len++;
      }

      if (startNode === 1) {
        cycleLengthDistribution[len] = (cycleLengthDistribution[len] || 0) + 1;
      }

      if (len !== 24 || curr !== startNode || visited.size !== 24) {
        subcycleViolations++;
        break;
      }
    }

    // Check 2-cycles (A -> B and B -> A)
    for (const [giver, receiver] of map.entries()) {
      if (map.get(receiver) === giver) {
        reciprocalViolations++;
      }
    }

    // Check 3-cycles (A -> B -> C -> A)
    for (const [a, b] of map.entries()) {
      const c = map.get(b);
      if (c !== undefined && map.get(c) === a) {
        threeCycleViolations++;
      }
    }

    // 4. Non-determinism / Entropy check
    if (seenHashes.has(result.verificationHash)) {
      hashCollisions++;
    } else {
      seenHashes.add(result.verificationHash);
    }

    // Spot-check verification hash integrity every 100 runs
    if (iter % 100 === 0) {
      if (verifyAssignmentsIntegrity(result.pairs, result.verificationHash)) {
        hashIntegrityChecksPassed++;
      } else {
        hashIntegrityChecksFailed++;
      }
    }
  }

  const elapsedMs = performance.now() - start;

  // Calculate Chi-Square across all 24 * 23 = 552 off-diagonal edges
  const expectedEdgeCount = iterations / 23;
  let chiSquare = 0;
  let minEdgeCount = Infinity;
  let maxEdgeCount = -Infinity;
  let nonZeroEdges = 0;

  for (let i = 1; i <= 24; i++) {
    for (let j = 1; j <= 24; j++) {
      if (i === j) {
        if (edgeMatrix[i][j] !== 0) {
          fixedPointViolations += edgeMatrix[i][j];
        }
        continue;
      }

      const count = edgeMatrix[i][j];
      if (count > 0) nonZeroEdges++;
      if (count < minEdgeCount) minEdgeCount = count;
      if (count > maxEdgeCount) maxEdgeCount = count;

      const diff = count - expectedEdgeCount;
      chiSquare += (diff * diff) / expectedEdgeCount;
    }
  }

  // Edge cases verification
  const edgeCasesResults: Record<string, boolean> = {};

  // Case: N = 0
  try {
    generateSingleCycleDerangement([]);
    edgeCasesResults['N=0 throws'] = false;
  } catch {
    edgeCasesResults['N=0 throws'] = true;
  }

  // Case: N = 1
  try {
    generateSingleCycleDerangement([99]);
    edgeCasesResults['N=1 throws'] = false;
  } catch {
    edgeCasesResults['N=1 throws'] = true;
  }

  // Case: Duplicate IDs
  try {
    generateSingleCycleDerangement([1, 2, 3, 2]);
    edgeCasesResults['Duplicates throw'] = false;
  } catch {
    edgeCasesResults['Duplicates throw'] = true;
  }

  // Case: N = 2
  const res2 = generateSingleCycleDerangement([100, 200]);
  const map2 = new Map(res2.pairs.map((p) => [p.giver_id, p.receiver_id]));
  edgeCasesResults['N=2 valid'] =
    res2.pairs.length === 2 && map2.get(100) === 200 && map2.get(200) === 100;

  // Case: Arbitrary / Non-contiguous IDs (e.g. actual colleague IDs)
  const arbitraryIds = [
    101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191,
    193, 197, 199, 211, 223, 227,
  ];
  const resArb = generateSingleCycleDerangement(arbitraryIds);
  const mapArb = new Map(resArb.pairs.map((p) => [p.giver_id, p.receiver_id]));
  let arbCycleLen = 0;
  let arbCurr = arbitraryIds[0];
  const arbVisited = new Set<number>();
  while (!arbVisited.has(arbCurr)) {
    arbVisited.add(arbCurr);
    arbCurr = mapArb.get(arbCurr)!;
    arbCycleLen++;
  }
  edgeCasesResults['Arbitrary non-contiguous IDs valid single cycle'] =
    arbCycleLen === 24 && arbCurr === arbitraryIds[0] && arbVisited.size === 24;

  // Case: Pure immutability
  const originalList = [1, 2, 3, 4, 5];
  const clonedList = [...originalList];
  generateSingleCycleDerangement(originalList);
  edgeCasesResults['Input array immutability'] =
    JSON.stringify(originalList) === JSON.stringify(clonedList);

  // Case: Object.freeze
  const frozenList = Object.freeze([10, 20, 30, 40]);
  try {
    generateSingleCycleDerangement(frozenList as unknown as number[]);
    edgeCasesResults['Object.freeze support'] = true;
  } catch {
    edgeCasesResults['Object.freeze support'] = false;
  }

  // Case: Large N = 1000
  const largeList = Array.from({ length: 1000 }, (_, i) => i + 1);
  const largeRes = generateSingleCycleDerangement(largeList);
  const largeMap = new Map(largeRes.pairs.map((p) => [p.giver_id, p.receiver_id]));
  let largeLen = 0;
  let largeCurr = 1;
  const largeVisited = new Set<number>();
  while (!largeVisited.has(largeCurr)) {
    largeVisited.add(largeCurr);
    largeCurr = largeMap.get(largeCurr)!;
    largeLen++;
  }
  edgeCasesResults['Large N=1000 single cycle'] =
    largeLen === 1000 && largeCurr === 1 && largeVisited.size === 1000;

  // Case: Hash tamper sensitivity
  const normalRes = generateSingleCycleDerangement(PARTICIPANTS_24);
  const tamperedPairs = normalRes.pairs.map((p) => ({ ...p }));
  const tmp = tamperedPairs[0].receiver_id;
  tamperedPairs[0].receiver_id = tamperedPairs[1].receiver_id;
  tamperedPairs[1].receiver_id = tmp;
  edgeCasesResults['Hash tamper detection'] =
    !verifyAssignmentsIntegrity(tamperedPairs, normalRes.verificationHash) &&
    verifyAssignmentsIntegrity(normalRes.pairs, normalRes.verificationHash);

  return {
    iterations,
    totalPairingsEvaluated: totalPairings,
    fixedPointViolations,
    bijectivityViolations,
    subcycleViolations,
    reciprocalViolations,
    threeCycleViolations,
    cycleLengthDistribution,
    uniquePermutationsCount: seenHashes.size,
    hashCollisions,
    hashIntegrityChecksPassed,
    hashIntegrityChecksFailed,
    chiSquare,
    degreesOfFreedom: 506,
    chiSquarePerDof: chiSquare / 506,
    edgeCoverage: (nonZeroEdges / 552) * 100,
    minEdgeCount,
    maxEdgeCount,
    expectedEdgeCount,
    elapsedMs,
    opsPerSec: iterations / (elapsedMs / 1000),
    edgeCasesResults,
  };
}

// Execute 100,000 iterations
console.log('Running 100,000 empirical iterations stress test...');
const results = runEmpiricalHarness(100000);
console.log(JSON.stringify(results, null, 2));
