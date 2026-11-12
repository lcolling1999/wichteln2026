import { useState, useEffect, useRef, useCallback } from 'react';
import { soundEngine } from '../audio/soundEngine';

export interface UseShakeOptions {
  threshold?: number;        // Linear acceleration magnitude threshold in m/s^2 (default: 16)
  gravityThreshold?: number; // Gravity-inclusive threshold in m/s^2 (default: 24)
  durationMs?: number;       // Blizzard active duration in ms (default: 3000)
  onShake?: () => void;      // Callback when shake is detected
  enabled?: boolean;         // Enable/disable listener
}

export interface UseShakeReturn {
  isBlizzard: boolean;
  triggerBlizzard: () => void;
}

/**
 * Pure calculation for linear acceleration magnitude
 */
export function calculateShakeMagnitude(
  acc?: { x: number | null; y: number | null; z: number | null } | null,
  accG?: { x: number | null; y: number | null; z: number | null } | null
): { magnitude: number; isGravityCompensated: boolean } {
  if (acc && (acc.x !== null || acc.y !== null || acc.z !== null)) {
    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;
    return {
      magnitude: Math.sqrt(x * x + y * y + z * z),
      isGravityCompensated: false,
    };
  }

  if (accG && (accG.x !== null || accG.y !== null || accG.z !== null)) {
    const x = accG.x ?? 0;
    const y = accG.y ?? 0;
    const z = accG.z ?? 0;
    const total = Math.sqrt(x * x + y * y + z * z);
    return {
      magnitude: Math.abs(total - 9.81),
      isGravityCompensated: true,
    };
  }

  return { magnitude: 0, isGravityCompensated: false };
}

export function useShake(options: UseShakeOptions = {}): UseShakeReturn {
  const {
    threshold = 16,
    gravityThreshold = 24,
    durationMs = 3000,
    onShake,
    enabled = true,
  } = options;

  const [isBlizzard, setIsBlizzard] = useState<boolean>(false);
  const lastTriggerRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerBlizzard = useCallback(() => {
    const now = Date.now();
    // 3-second lockout prevents audio thrashing and animation reset loops
    if (now - lastTriggerRef.current < durationMs) return;

    lastTriggerRef.current = now;
    setIsBlizzard(true);
    soundEngine.playWindGust();
    onShake?.();

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsBlizzard(false);
    }, durationMs);
  }, [durationMs, onShake]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // 1. Accelerometer motion listener (DeviceMotionEvent)
    const handleMotion = (e: DeviceMotionEvent) => {
      const { magnitude, isGravityCompensated } = calculateShakeMagnitude(
        e.acceleration,
        e.accelerationIncludingGravity
      );
      const limit = isGravityCompensated ? Math.max(0, gravityThreshold - 9.81) : threshold;

      if (magnitude >= limit) {
        triggerBlizzard();
      }
    };

    // 2. Desktop Fallback: Keyboard shortcut ('s' or 'b')
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 's' || e.key === 'S' || e.key === 'b' || e.key === 'B') {
        triggerBlizzard();
      }
    };

    // 3. Test Helper exposed on window
    (window as any).__triggerBlizzard = triggerBlizzard;

    // 4. iOS 13+ Safari requires explicit DeviceMotionEvent.requestPermission() inside a user gesture
    const motionApi = (window as any).DeviceMotionEvent;
    const needsPermission = typeof motionApi?.requestPermission === 'function';
    const requestMotionOnGesture = () => {
      window.removeEventListener('click', requestMotionOnGesture);
      window.removeEventListener('touchend', requestMotionOnGesture);
      try {
        const res = motionApi.requestPermission();
        if (res && typeof res.catch === 'function') res.catch(() => {});
      } catch {
        // Ignore if denied or outside gesture
      }
    };
    if (needsPermission) {
      window.addEventListener('click', requestMotionOnGesture, { passive: true });
      window.addEventListener('touchend', requestMotionOnGesture, { passive: true });
    }

    window.addEventListener('devicemotion', handleMotion);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', requestMotionOnGesture);
      window.removeEventListener('touchend', requestMotionOnGesture);
      if (timerRef.current) clearTimeout(timerRef.current);
      delete (window as any).__triggerBlizzard;
    };
  }, [enabled, threshold, gravityThreshold, triggerBlizzard]);

  return { isBlizzard, triggerBlizzard };
}
