import { generateSingleCycleDerangement, verifyAssignmentsIntegrity } from '../server/services/derangement.service.js';

interface Stats {
  iterations: number;
  totalPairings: number;
  fixedPoints: number;
  nonBijectiveRuns: number;
  cycleLengthCounts: Record<number, number>;
  isolatedSubcycles: number;
  reciprocalPairs: number;
  hashFailures: number;
  edgeCounts: number[][];
  elapsedMs: number;
}

function runStress(iterations: number): Stats {
  const participants = Array.from({ length: 24 }, (_, i) => i + 1);
  const stats: Stats = {
    iterations,
    totalPairings: iterations * 24,
    fixedPoints: 0,
    nonBijectiveRuns: 0,
    cycleLengthCounts: {},
    isolatedSubcycles: 0,
    reciprocalPairs: 0,
    hashFailures: 0,
    edgeCounts: Array.from({ length: 25 }, () => new Array(25).fill(0)),
    elapsedMs: 0,
  };

  const start = performance.now();

  for (let iter = 0; iter < iterations; iter++) {
    const res = generateSingleCycleDerangement(participants);
    const pairs = res.pairs;

    const giverSet = new Set<number>();
    const receiverSet = new Set<number>();
    const nextMap = new Map<number, number>();

    for (const p of pairs) {
      if (p.giver_id === p.receiver_id) {
        stats.fixedPoints++;
      }
      giverSet.add(p.giver_id);
      receiverSet.add(p.receiver_id);
      nextMap.set(p.giver_id, p.receiver_id);
      stats.edgeCounts[p.giver_id][p.receiver_id]++;
    }

    if (giverSet.size !== 24 || receiverSet.size !== 24 || pairs.length !== 24) {
      stats.nonBijectiveRuns++;
    }

    // Traverse cycle from node 1
    let curr = 1;
    let cycleLen = 0;
    const visited = new Set<number>();
    while (!visited.has(curr) && cycleLen <= 25) {
      visited.add(curr);
      curr = nextMap.get(curr)!;
      cycleLen++;
    }

    stats.cycleLengthCounts[cycleLen] = (stats.cycleLengthCounts[cycleLen] || 0) + 1;

    // Check all nodes are in this single cycle
    if (visited.size !== 24 || curr !== 1) {
      stats.isolatedSubcycles++;
    }

    // Check reciprocity
    for (const [g, r] of nextMap.entries()) {
      if (nextMap.get(r) === g) {
        stats.reciprocalPairs++;
      }
    }

    // Spot-check hash every 100 iterations
    if (iter % 100 === 0) {
      if (!verifyAssignmentsIntegrity(res.pairs, res.verificationHash)) {
        stats.hashFailures++;
      }
    }
  }

  stats.elapsedMs = performance.now() - start;
  return stats;
}

const stats = runStress(50000); // 50,000 iterations!

console.log(JSON.stringify({
  iterations: stats.iterations,
  totalPairings: stats.totalPairings,
  fixedPoints: stats.fixedPoints,
  nonBijectiveRuns: stats.nonBijectiveRuns,
  cycleLengthCounts: stats.cycleLengthCounts,
  isolatedSubcycles: stats.isolatedSubcycles,
  reciprocalPairs: stats.reciprocalPairs,
  hashFailures: stats.hashFailures,
  elapsedMs: stats.elapsedMs.toFixed(2),
  opsPerSec: (stats.iterations / (stats.elapsedMs / 1000)).toFixed(0),
}, null, 2));

// Calculate Chi-Square across all 24 * 23 = 552 off-diagonal edges
// Expected count per edge = 50,000 / 23 = 2173.913043...
const E = stats.iterations / 23;
let chiSquare = 0;
let minCount = Infinity;
let maxCount = -Infinity;

for (let i = 1; i <= 24; i++) {
  for (let j = 1; j <= 24; j++) {
    if (i === j) {
      if (stats.edgeCounts[i][j] !== 0) {
        console.error(`ERROR: Diagonal edge (${i}, ${i}) has count ${stats.edgeCounts[i][j]}`);
      }
      continue;
    }
    const count = stats.edgeCounts[i][j];
    if (count < minCount) minCount = count;
    if (count > maxCount) maxCount = count;
    const diff = count - E;
    chiSquare += (diff * diff) / E;
  }
}

console.log(JSON.stringify({
  E_expected: E.toFixed(3),
  minCount,
  maxCount,
  chiSquare: chiSquare.toFixed(3),
  degreesOfFreedom: 506,
  chiSquarePerDof: (chiSquare / 506).toFixed(3),
}, null, 2));
