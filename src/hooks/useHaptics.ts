/**
 * Safe Haptic Feedback Hook & Utilities
 * Provides resilient navigator.vibrate abstraction with strict graceful degradation
 * for iOS Safari, headless testing environments, and missing device APIs.
 */

export function isVibrationSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  );
}

export function vibratePattern(pattern: number | number[]): boolean {
  if (!isVibrationSupported()) return false;
  try {
    return navigator?.vibrate?.(pattern) ?? false;
  } catch {
    return false;
  }
}

export function vibrateTick(): boolean {
  return vibratePattern(5);
}

export function vibrateBolt(): boolean {
  return vibratePattern([20, 50, 20]);
}

/**
 * Graduated tick for the combination lock (level 0 = far, 3 = right in front of the bolt).
 * Very short pulses (< 8ms) are barely noticeable on many Android devices, so the weakest
 * tick is 8ms and the strongest 18ms - still clearly different from the double pulse of a
 * locking bolt.
 */
export function vibrateProximity(level: number): boolean {
  const lvl = Math.max(0, Math.min(3, Math.round(level)));
  return vibratePattern([8, 11, 14, 18][lvl]);
}

export interface UseHapticsReturn {
  isSupported: boolean;
  vibrate: (pattern: number | number[]) => boolean;
  tick: () => boolean;
  boltLock: () => boolean;
  proximityTick: (level: number) => boolean;
  vibrateTick: () => boolean;
  vibrateBolt: () => boolean;
  vibratePattern: (pattern: number | number[]) => boolean;
  isVibrationSupported: () => boolean;
}

export function useHaptics(): UseHapticsReturn {
  const isSupported = isVibrationSupported();

  return {
    isSupported,
    vibrate: vibratePattern,
    tick: vibrateTick,
    boltLock: vibrateBolt,
    proximityTick: vibrateProximity,
    vibrateTick,
    vibrateBolt,
    vibratePattern,
    isVibrationSupported,
  };
}
