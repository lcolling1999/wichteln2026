/**
 * Pure state machine for the safe's combination lock.
 *
 * Like a real safe, the three bolts have to be opened in a fixed order and with alternating
 * spin directions: clockwise -> counter-clockwise -> clockwise.
 *
 * Angles are "dial rotation" values in degrees (0..360). Turning the dial clockwise
 * increases the angle, turning it counter-clockwise decreases it.
 */

export type SpinDirection = 'cw' | 'ccw';

export interface BoltTarget {
  /** Dial angle (0..360) at which the bolt snaps in. */
  angle: number;
  /** Direction the dial has to be moving while it passes the target. */
  direction: SpinDirection;
}

export const SAFE_COMBINATION: readonly BoltTarget[] = [
  { angle: 135, direction: 'cw' },
  { angle: 315, direction: 'ccw' },
  { angle: 90, direction: 'cw' },
];

/** Half-width of the lock window around a target angle. */
export const LOCK_WINDOW_DEG = 6;
/** Inside this distance the feedback gets finer and "warmer". */
export const NEAR_ZONE_DEG = 45;
/** Distance at which the heat meter starts to rise. */
export const HEAT_RANGE_DEG = 90;

export interface SafeState {
  /** Normalised dial angle (0..360). */
  angle: number;
  lockedBolts: number;
}

export interface RotationResult {
  state: SafeState;
  /** A bolt snapped in during this step. */
  lockedNow: boolean;
  /** All bolts are open after this step. */
  unlocked: boolean;
  /** The dial moves against the direction the current bolt needs. */
  wrongDirection: boolean;
  /** Circular distance to the active target (180 when everything is unlocked). */
  distance: number;
  /** 0 (cold) .. 1 (hot) */
  proximity: number;
}

export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

export function circularDistance(a: number, b: number): number {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, 360 - diff);
}

/**
 * Returns true when the swept arc [start, start + delta] touches the lock window around
 * `targetAngle`. Sweeping (instead of sampling the end position) guarantees that even a very
 * fast flick of the thumb can never "jump over" a bolt.
 */
export function sweepHitsTarget(
  start: number,
  delta: number,
  targetAngle: number,
  windowDeg: number = LOCK_WINDOW_DEG
): boolean {
  const lo = Math.min(start, start + delta);
  const hi = Math.max(start, start + delta);
  const kMin = Math.floor((lo - windowDeg - targetAngle) / 360);
  const kMax = Math.ceil((hi + windowDeg - targetAngle) / 360);
  for (let k = kMin; k <= kMax; k++) {
    const t = targetAngle + 360 * k;
    if (t + windowDeg >= lo && t - windowDeg <= hi) return true;
  }
  return false;
}

export function proximityFromDistance(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance / HEAT_RANGE_DEG));
}

/** Tick grid gets finer when the dial is close to the target. */
export function getTickStepDegrees(distance: number): number {
  return distance < NEAR_ZONE_DEG ? 5 : 15;
}

/** 0 = far away ... 3 = right in front of the bolt. Drives vibration strength and sound pitch. */
export function getFeedbackLevel(distance: number): 0 | 1 | 2 | 3 {
  if (distance < 12) return 3;
  if (distance < 30) return 2;
  if (distance < 60) return 1;
  return 0;
}

export function getHeatLabel(proximity: number): string {
  if (proximity < 0.15) return 'Kalt ❄️';
  if (proximity < 0.45) return 'Kühl';
  if (proximity < 0.75) return 'Warm 🔥';
  return 'Heiß – gleich rastet er ein!';
}

export function directionLabel(direction: SpinDirection): string {
  return direction === 'cw' ? 'im Uhrzeigersinn ↻' : 'gegen den Uhrzeigersinn ↺';
}

export function createInitialSafeState(): SafeState {
  return { angle: 0, lockedBolts: 0 };
}

/**
 * Applies a rotation delta (degrees, + = clockwise) to the safe state.
 */
export function applyRotation(
  state: SafeState,
  delta: number,
  combination: readonly BoltTarget[] = SAFE_COMBINATION
): RotationResult {
  const total = combination.length;
  const startAngle = normalizeAngle(state.angle);

  if (state.lockedBolts >= total) {
    return {
      state: { angle: startAngle, lockedBolts: state.lockedBolts },
      lockedNow: false,
      unlocked: true,
      wrongDirection: false,
      distance: 180,
      proximity: 0,
    };
  }

  if (!Number.isFinite(delta) || delta === 0) {
    const target = combination[state.lockedBolts];
    const distance = circularDistance(startAngle, target.angle);
    return {
      state: { angle: startAngle, lockedBolts: state.lockedBolts },
      lockedNow: false,
      unlocked: false,
      wrongDirection: false,
      distance,
      proximity: proximityFromDistance(distance),
    };
  }

  const target = combination[state.lockedBolts];
  const direction: SpinDirection = delta > 0 ? 'cw' : 'ccw';
  const wrongDirection = direction !== target.direction;
  const endAngle = normalizeAngle(startAngle + delta);

  const hit = !wrongDirection && sweepHitsTarget(startAngle, delta, target.angle);

  if (hit) {
    const lockedBolts = state.lockedBolts + 1;
    const next = combination[lockedBolts];
    const distance = next ? circularDistance(endAngle, next.angle) : 180;
    return {
      state: { angle: endAngle, lockedBolts },
      lockedNow: true,
      unlocked: lockedBolts >= total,
      wrongDirection: false,
      distance,
      proximity: next ? proximityFromDistance(distance) : 0,
    };
  }

  const distance = circularDistance(endAngle, target.angle);
  return {
    state: { angle: endAngle, lockedBolts: state.lockedBolts },
    lockedNow: false,
    unlocked: false,
    wrongDirection,
    distance,
    proximity: proximityFromDistance(distance),
  };
}
