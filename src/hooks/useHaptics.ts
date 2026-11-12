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

/**
 * iOS 17.4+ / iOS 18 Safari fallback: hidden `<input type="checkbox" switch>` label click
 * triggers the iPhone Taptic Engine when called during a user interaction.
 */
let iosSwitchLabel: HTMLLabelElement | null = null;

function triggerIosTaptic(): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  try {
    if (!iosSwitchLabel || !document.body.contains(iosSwitchLabel)) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText =
        'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitchLabel = label;
    }
    iosSwitchLabel.click();
    return true;
  } catch {
    return false;
  }
}

export function vibratePattern(pattern: number | number[]): boolean {
  if (isVibrationSupported()) {
    try {
      return navigator?.vibrate?.(pattern) ?? false;
    } catch {
      return false;
    }
  }
  // Fallback for iPhone / iOS Safari (Taptic Engine switch trick)
  if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
    const pulses = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
    const triggered = triggerIosTaptic();
    if (triggered && pulses > 1) {
      setTimeout(() => triggerIosTaptic(), 80);
    }
    return triggered;
  }
  return false;
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
