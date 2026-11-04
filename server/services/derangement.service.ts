import crypto from 'node:crypto';

export interface AssignmentPair {
  giver_id: number;
  receiver_id: number;
}

export interface DerangementResult {
  pairs: AssignmentPair[];
  cycle: number[];
  verificationHash: string;
}

/**
 * Generates a uniform single Hamiltonian cycle derangement over the provided participant IDs.
 * Combines CSPRNG Fisher-Yates shuffle with a cyclic shift (k -> (k + 1) % n).
 * Guarantees:
 * - Zero self-draws: giver_id != receiver_id for all pairs
 * - Bijectivity: every participant gives once and receives once
 * - Single connected Hamiltonian cycle of length n: zero disjoint sub-cycles
 * - Uniform distribution over (n - 1)! cycles without modulo bias
 */
export function generateSingleCycleDerangement(participantIds: number[]): DerangementResult {
  const n = participantIds.length;
  if (n < 2) {
    throw new Error(`Derangement requires at least 2 participants. Received: ${n}`);
  }

  // Validate distinct IDs
  const uniqueSet = new Set(participantIds);
  if (uniqueSet.size !== n) {
    throw new Error('Participant IDs must all be distinct.');
  }

  // 1. CSPRNG Fisher-Yates shuffle
  const shuffled = [...participantIds];
  for (let i = n - 1; i > 0; i--) {
    // crypto.randomInt(0, i + 1) produces an integer in [0, i] without modulo bias
    const j = crypto.randomInt(0, i + 1);
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  // 2. Cyclic shift: giver = shuffled[k], receiver = shuffled[(k + 1) % n]
  const pairs: AssignmentPair[] = new Array(n);
  for (let k = 0; k < n; k++) {
    pairs[k] = {
      giver_id: shuffled[k],
      receiver_id: shuffled[(k + 1) % n],
    };
  }

  // 3. Compute deterministic verification hash over canonical sorted pairs
  const verificationHash = computeVerificationHash(pairs);

  return {
    pairs,
    cycle: shuffled,
    verificationHash,
  };
}

/**
 * Computes a deterministic SHA-256 hash over canonically sorted assignment pairs.
 * Pairs are sorted by giver_id ascending to guarantee independence of generation order.
 */
export function computeVerificationHash(pairs: AssignmentPair[]): string {
  // Sort canonically by giver_id ascending
  const canonical = [...pairs].sort((a, b) => a.giver_id - b.giver_id);

  // Serialize to deterministic JSON
  const canonicalPayload = JSON.stringify(
    canonical.map((p) => ({
      giver_id: p.giver_id,
      receiver_id: p.receiver_id,
    }))
  );

  return crypto
    .createHash('sha256')
    .update(canonicalPayload, 'utf8')
    .digest('hex');
}

/**
 * Validates whether a given list of assignment pairs matches an expected verification hash.
 * Constant-time comparison protects against timing analysis.
 */
export function verifyAssignmentsIntegrity(
  pairs: AssignmentPair[],
  expectedHash: string
): boolean {
  if (!expectedHash || typeof expectedHash !== 'string' || expectedHash.length !== 64) {
    return false;
  }
  const actualHash = computeVerificationHash(pairs);
  const actualBuf = Buffer.from(actualHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}
