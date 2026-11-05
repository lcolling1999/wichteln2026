import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  generateSingleCycleDerangement,
  computeVerificationHash,
  verifyAssignmentsIntegrity,
  AssignmentPair,
} from '../server/services/derangement.service.js';
import { initializeSchema } from '../server/db/schema.js';
import { seedDatabase, SEED_COLLEAGUES } from '../server/db/seeds.js';
import { createQueryLayer } from '../server/db/queries.js';
import { setDatabase } from '../server/db/database.js';
import { AdminService, AdminError } from '../server/services/admin.service.js';

interface DerangementStressReport {
  iterations: number;
  totalPairingsGenerated: number;
  fixedPointViolations: number;
  bijectivityViolations: number;
  subCycleViolations: number;
  reciprocal2CycleViolations: number;
  hashFailures: number;
  chiSquare: number;
  degreesOfFreedom: number;
  chiSquarePerDof: number;
  minEdgeCount: number;
  maxEdgeCount: number;
  elapsedMs: number;
  drawsPerSec: number;
}

interface ConcurrencyStressReport {
  concurrentDrawBurst: {
    totalRequests: number;
    successCount: number;
    conflictCount: number;
    otherCount: number;
    databaseAssignmentCount: number;
    databaseIsDrawn: number;
    verificationHashValid: boolean;
  };
  concurrentRegistrationBurst: {
    totalBursts: number;
    requestsPerBurst: number;
    total200: number;
    total409: number;
    totalOther: number;
    allDbAuthenticatorsConsistent: boolean;
  };
}

// ============================================================================
// PART 1: Derangement Permutation Empirical Challenge (100,000 Iterations)
// ============================================================================
export function runDerangementPermutationStress(iterations = 100000): DerangementStressReport {
  const participants = Array.from({ length: 24 }, (_, i) => i + 1);
  const edgeMatrix: number[][] = Array.from({ length: 25 }, () => new Array(25).fill(0));

  let fixedPointViolations = 0;
  let bijectivityViolations = 0;
  let subCycleViolations = 0;
  let reciprocal2CycleViolations = 0;
  let hashFailures = 0;

  const start = performance.now();

  for (let iter = 0; iter < iterations; iter++) {
    const res = generateSingleCycleDerangement(participants);
    const pairs = res.pairs;

    if (pairs.length !== 24) {
      bijectivityViolations++;
    }

    const givers = new Set<number>();
    const receivers = new Set<number>();
    const map = new Map<number, number>();

    for (const p of pairs) {
      // 1. Invariant: Zero self-gifting
      if (p.giver_id === p.receiver_id) {
        fixedPointViolations++;
      }

      givers.add(p.giver_id);
      receivers.add(p.receiver_id);
      map.set(p.giver_id, p.receiver_id);
      edgeMatrix[p.giver_id][p.receiver_id]++;
    }

    // 2. Invariant: Bijectivity (domain and range size exactly 24)
    if (givers.size !== 24 || receivers.size !== 24 || map.size !== 24) {
      bijectivityViolations++;
    }

    // 3. Invariant: Single Hamiltonian cycle of length 24 (no subcycles)
    // Traverse from node 1
    let curr = 1;
    let steps = 0;
    const visited = new Set<number>();
    while (!visited.has(curr) && steps <= 25) {
      visited.add(curr);
      curr = map.get(curr)!;
      steps++;
    }

    if (steps !== 24 || curr !== 1 || visited.size !== 24) {
      subCycleViolations++;
    }

    // 4. Invariant: In single cycle of length 24, reciprocity (A -> B and B -> A) is impossible
    for (const [g, r] of map.entries()) {
      if (map.get(r) === g) {
        reciprocal2CycleViolations++;
      }
    }

    // 5. Invariant: SHA-256 verification hash integrity (spot-check every 500)
    if (iter % 500 === 0) {
      if (!verifyAssignmentsIntegrity(pairs, res.verificationHash)) {
        hashFailures++;
      }
    }
  }

  const elapsedMs = performance.now() - start;

  // Chi-Square Uniformity Test across 24 * 23 = 552 off-diagonal edges
  // Expected count per off-diagonal edge: E = iterations / 23
  const E = iterations / 23;
  let chiSquare = 0;
  let minEdgeCount = Infinity;
  let maxEdgeCount = -Infinity;

  for (let i = 1; i <= 24; i++) {
    for (let j = 1; j <= 24; j++) {
      if (i === j) {
        if (edgeMatrix[i][j] !== 0) {
          fixedPointViolations += edgeMatrix[i][j];
        }
        continue;
      }
      const count = edgeMatrix[i][j];
      if (count < minEdgeCount) minEdgeCount = count;
      if (count > maxEdgeCount) maxEdgeCount = count;
      const diff = count - E;
      chiSquare += (diff * diff) / E;
    }
  }

  const degreesOfFreedom = (24 - 1) * (24 - 2); // 506

  return {
    iterations,
    totalPairingsGenerated: iterations * 24,
    fixedPointViolations,
    bijectivityViolations,
    subCycleViolations,
    reciprocal2CycleViolations,
    hashFailures,
    chiSquare,
    degreesOfFreedom,
    chiSquarePerDof: chiSquare / degreesOfFreedom,
    minEdgeCount,
    maxEdgeCount,
    elapsedMs,
    drawsPerSec: iterations / (elapsedMs / 1000),
  };
}

// ============================================================================
// PART 2: Boundary & Edge Case Permutation Challenges
// ============================================================================
export function runBoundaryPermutationChallenges(): {
  n0Throws: boolean;
  n1Throws: boolean;
  n2Valid: boolean;
  n3Distribution: { countA: number; countB: number };
  duplicatesThrow: boolean;
  largeN2000ElapsedMs: number;
  largeN2000CycleValid: boolean;
  immutabilityPassed: boolean;
  tamperDetected: boolean;
} {
  // N = 0
  let n0Throws = false;
  try {
    generateSingleCycleDerangement([]);
  } catch {
    n0Throws = true;
  }

  // N = 1
  let n1Throws = false;
  try {
    generateSingleCycleDerangement([99]);
  } catch {
    n1Throws = true;
  }

  // N = 2
  const n2Res = generateSingleCycleDerangement([10, 20]);
  const n2Map = new Map(n2Res.pairs.map((p) => [p.giver_id, p.receiver_id]));
  const n2Valid = n2Map.get(10) === 20 && n2Map.get(20) === 10;

  // N = 3
  let countA = 0;
  let countB = 0;
  for (let i = 0; i < 2000; i++) {
    const res = generateSingleCycleDerangement([1, 2, 3]);
    const m = new Map(res.pairs.map((p) => [p.giver_id, p.receiver_id]));
    if (m.get(1) === 2 && m.get(2) === 3 && m.get(3) === 1) countA++;
    else if (m.get(1) === 3 && m.get(3) === 2 && m.get(2) === 1) countB++;
  }

  // Duplicates
  let duplicatesThrow = false;
  try {
    generateSingleCycleDerangement([1, 2, 3, 2]);
  } catch {
    duplicatesThrow = true;
  }

  // Large N = 2,000
  const largeIds = Array.from({ length: 2000 }, (_, i) => i + 1);
  const startLarge = performance.now();
  const largeRes = generateSingleCycleDerangement(largeIds);
  const largeN2000ElapsedMs = performance.now() - startLarge;
  const largeMap = new Map(largeRes.pairs.map((p) => [p.giver_id, p.receiver_id]));
  let curr = 1;
  let steps = 0;
  const visited = new Set<number>();
  while (!visited.has(curr)) {
    visited.add(curr);
    curr = largeMap.get(curr)!;
    steps++;
  }
  const largeN2000CycleValid = steps === 2000 && curr === 1;

  // Immutability
  const original = [1, 2, 3, 4, 5];
  const copy = [...original];
  Object.freeze(original);
  generateSingleCycleDerangement(original);
  const immutabilityPassed = JSON.stringify(original) === JSON.stringify(copy);

  // Tamper detection
  const sample = generateSingleCycleDerangement([1, 2, 3, 4]);
  const tamperedPairs = sample.pairs.map((p) => ({ ...p }));
  // swap receivers
  const temp = tamperedPairs[0].receiver_id;
  tamperedPairs[0].receiver_id = tamperedPairs[1].receiver_id;
  tamperedPairs[1].receiver_id = temp;
  const tamperDetected =
    verifyAssignmentsIntegrity(sample.pairs, sample.verificationHash) === true &&
    verifyAssignmentsIntegrity(tamperedPairs, sample.verificationHash) === false;

  return {
    n0Throws,
    n1Throws,
    n2Valid,
    n3Distribution: { countA, countB },
    duplicatesThrow,
    largeN2000ElapsedMs,
    largeN2000CycleValid,
    immutabilityPassed,
    tamperDetected,
  };
}

// ============================================================================
// PART 3: Concurrency & Race Condition Stress Challenges
// ============================================================================
export async function runConcurrencyRaceStress(): Promise<ConcurrencyStressReport> {
  // Test 1: 10 Simultaneous Admin Draws
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  initializeSchema(db);
  seedDatabase(db);
  setDatabase(db);

  const q = createQueryLayer(db);
  // Register all 24 colleagues
  for (let id = 1; id <= 24; id++) {
    q.setParticipantRegistered(id);
  }

  const admin = new AdminService();
  const drawBurstCount = 10;
  const drawPromises = Array.from({ length: drawBurstCount }, (_, idx) => {
    return Promise.resolve().then(() => {
      try {
        const res = admin.executeDraw(`session-admin-${idx}`);
        return { status: 200, res };
      } catch (err: any) {
        if (err instanceof AdminError) {
          return { status: err.statusCode, code: err.code };
        }
        return { status: 500, error: err.message };
      }
    });
  });

  const drawResults = await Promise.all(drawPromises);
  const drawSuccess = drawResults.filter((r) => r.status === 200).length;
  const drawConflict = drawResults.filter((r) => r.status === 409 && r.code === 'ALREADY_DRAWN').length;
  const drawOther = drawResults.filter((r) => r.status !== 200 && r.status !== 409).length;

  const dbStatus = q.getDrawStatus();
  const assignments = db.prepare('SELECT * FROM assignments').all() as Array<{
    giver_id: number;
    receiver_id: number;
  }>;

  const verificationHashValid = verifyAssignmentsIntegrity(assignments, dbStatus.verification_hash!);

  // Test 2: Concurrency bursts on participant registration
  let total200 = 0;
  let total409 = 0;
  let totalOther = 0;
  let allDbConsistent = true;

  const registrationBursts = 10;
  const requestsPerBurst = 5;

  for (let burst = 0; burst < registrationBursts; burst++) {
    const pId = (burst % 24) + 1;
    // reset registration for this participant
    db.prepare('DELETE FROM authenticators WHERE participant_id = ?').run(pId);
    db.prepare('UPDATE participants SET is_registered = 0 WHERE id = ?').run(pId);

    // Simulate concurrent attempts to mark registered via atomic transactions
    const burstPromises = Array.from({ length: requestsPerBurst }, (_, reqIdx) => {
      return Promise.resolve().then(() => {
        try {
          let won = false;
          // Simulated registration transaction
          db.exec('BEGIN IMMEDIATE;');
          try {
            const p = q.getParticipantById(pId);
            if (p?.is_registered === 1) {
              db.exec('ROLLBACK;');
              return { status: 409, code: 'ALREADY_REGISTERED' };
            }
            q.createAuthenticator({
              id: `cred-${burst}-${reqIdx}`,
              participant_id: pId,
              public_key: Buffer.from([1, 2, 3]),
              counter: 0,
              transports: '["internal"]',
              device_type: 'singleDevice',
              backed_up: 0,
            });
            q.setParticipantRegistered(pId);
            db.exec('COMMIT;');
            won = true;
          } catch (e) {
            try { db.exec('ROLLBACK;'); } catch {}
            throw e;
          }
          return { status: 200, won };
        } catch (err: any) {
          return { status: 500, error: err.message };
        }
      });
    });

    const results = await Promise.all(burstPromises);
    const count200 = results.filter((r) => r.status === 200).length;
    const count409 = results.filter((r) => r.status === 409).length;
    const countOther = results.filter((r) => r.status !== 200 && r.status !== 409).length;

    total200 += count200;
    total409 += count409;
    totalOther += countOther;

    const authCount = db.prepare('SELECT COUNT(*) as cnt FROM authenticators WHERE participant_id = ?').get(pId) as { cnt: number };
    const pCheck = q.getParticipantById(pId);
    if (authCount.cnt !== 1 || pCheck?.is_registered !== 1) {
      allDbConsistent = false;
    }
  }

  return {
    concurrentDrawBurst: {
      totalRequests: drawBurstCount,
      successCount: drawSuccess,
      conflictCount: drawConflict,
      otherCount: drawOther,
      databaseAssignmentCount: assignments.length,
      databaseIsDrawn: dbStatus.is_drawn,
      verificationHashValid,
    },
    concurrentRegistrationBurst: {
      totalBursts: registrationBursts,
      requestsPerBurst,
      total200,
      total409,
      totalOther,
      allDbAuthenticatorsConsistent: allDbConsistent,
    },
  };
}

// ============================================================================
// Main Execution
// ============================================================================
async function main() {
  console.log('================================================================');
  console.log('MILIESTONE 5 CHALLENGER 2: EMPIRICAL STRESS HARNESS EXECUTION');
  console.log('================================================================\n');

  console.log('1. Executing Boundary & Edge Case Permutation Challenges...');
  const boundaryResults = runBoundaryPermutationChallenges();
  console.log('Boundary Results:', JSON.stringify(boundaryResults, null, 2));

  console.log('\n2. Executing 100,000 Iterations Monte Carlo Derangement Stress Test (N = 24)...');
  const derangementReport = runDerangementPermutationStress(100000);
  console.log('Derangement Report:', JSON.stringify(derangementReport, null, 2));

  console.log('\n3. Executing Concurrency & Race Condition Stress Challenges...');
  const concurrencyReport = await runConcurrencyRaceStress();
  console.log('Concurrency Report:', JSON.stringify(concurrencyReport, null, 2));

  console.log('\n================================================================');
  console.log('ALL EMPIRICAL CHALLENGES EXECUTED SUCCESSFULLY');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Fatal stress harness failure:', err);
  process.exit(1);
});
