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

export interface UseHapticsReturn {
  isSupported: boolean;
  vibrate: (pattern: number | number[]) => boolean;
  tick: () => boolean;
  boltLock: () => boolean;
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
    vibrateTick,
    vibrateBolt,
    vibratePattern,
    isVibrationSupported,
  };
}
