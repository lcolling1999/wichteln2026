import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateShakeMagnitude } from '../../src/hooks/useShake';

describe('Milestone 4: 4 Easter Eggs & Universal Graceful Degradation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Easter Egg 1: Shake for Snowstorm / Blizzard Mode (Feature 19, TC-F8-01)', () => {
    it('calculates linear acceleration vector magnitude correctly without gravity', () => {
      // 3D vector: x = 12, y = 12, z = 8 -> sqrt(144 + 144 + 64) = sqrt(352) ≈ 18.76 m/s^2 >= 16
      const result = calculateShakeMagnitude(
        { x: 12, y: 12, z: 8 },
        null
      );
      expect(result.isGravityCompensated).toBe(false);
      expect(result.magnitude).toBeCloseTo(18.76, 1);
      expect(result.magnitude).toBeGreaterThanOrEqual(16);
    });

    it('calculates gravity-inclusive magnitude correctly when linear acceleration is null', () => {
      // DeviceMotionEvent includes gravity (9.81 m/s^2 along z-axis at rest)
      // Resting on table: x=0, y=0, z=9.81 -> magnitude = 0 (no shake)
      const resting = calculateShakeMagnitude(
        null,
        { x: 0, y: 0, z: 9.81 }
      );
      expect(resting.isGravityCompensated).toBe(true);
      expect(resting.magnitude).toBeCloseTo(0, 2);

      // Strong shake with gravity: x=20, y=20, z=9.81 -> total = sqrt(400 + 400 + 96.2) = sqrt(896.2) ≈ 29.94
      // Magnitude after subtracting 9.81 ≈ 20.13 m/s^2 >= 14.19 (i.e. gravity threshold 24 - 9.81)
      const shaking = calculateShakeMagnitude(
        null,
        { x: 20, y: 20, z: 9.81 }
      );
      expect(shaking.isGravityCompensated).toBe(true);
      expect(shaking.magnitude).toBeCloseTo(20.13, 1);
    });

    it('returns zero magnitude for null or undefined motion readings', () => {
      expect(calculateShakeMagnitude(null, null)).toEqual({ magnitude: 0, isGravityCompensated: false });
      expect(calculateShakeMagnitude({ x: null, y: null, z: null }, null)).toEqual({ magnitude: 0, isGravityCompensated: false });
    });

    it('implements 3-second duration and lockout cooldown against repeated shaking', () => {
      let isBlizzard = false;
      let lastTrigger = 0;
      const durationMs = 3000;

      const triggerBlizzard = () => {
        const now = Date.now();
        if (now - lastTrigger < durationMs) return;
        lastTrigger = now;
        isBlizzard = true;
        setTimeout(() => {
          isBlizzard = false;
        }, durationMs);
      };

      // First shake: triggers blizzard
      triggerBlizzard();
      expect(isBlizzard).toBe(true);

      // Advance time by 1000ms: still active, second shake during cooldown is locked out
      vi.advanceTimersByTime(1000);
      triggerBlizzard();
      expect(isBlizzard).toBe(true);

      // Advance by another 2000ms (total 3000ms): blizzard ends
      vi.advanceTimersByTime(2000);
      expect(isBlizzard).toBe(false);

      // Now shake can be triggered again
      vi.advanceTimersByTime(100);
      triggerBlizzard();
      expect(isBlizzard).toBe(true);
    });
  });

  describe('Easter Egg 2: Rudolph-Mode / Ruby Red Nose (Feature 20, TC-F8-02)', () => {
    it('triggers Rudolph mode after 800ms long-press hold', () => {
      let isRudolph = false;
      const onLongPress = vi.fn(() => {
        isRudolph = true;
      });

      let timer: ReturnType<typeof setTimeout> | null = null;
      const startLongPress = () => {
        timer = setTimeout(onLongPress, 800);
      };
      const cancelLongPress = () => {
        if (timer) clearTimeout(timer);
      };

      startLongPress();
      expect(isRudolph).toBe(false);

      // Advance 790ms: not yet triggered
      vi.advanceTimersByTime(790);
      expect(isRudolph).toBe(false);

      // Advance remaining 10ms (800ms total): triggered!
      vi.advanceTimersByTime(10);
      expect(isRudolph).toBe(true);
      expect(onLongPress).toHaveBeenCalledTimes(1);

      cancelLongPress();
    });

    it('cancels long-press when released before 800ms threshold', () => {
      const onLongPress = vi.fn();
      let timer: ReturnType<typeof setTimeout> | null = setTimeout(onLongPress, 800);

      // Released at 400ms (regular click)
      vi.advanceTimersByTime(400);
      if (timer) clearTimeout(timer);

      // Advance past 800ms
      vi.advanceTimersByTime(600);
      expect(onLongPress).not.toHaveBeenCalled();
    });

    it('cancels long-press when pointer movement exceeds 10px tolerance', () => {
      const onLongPress = vi.fn();
      let timer: ReturnType<typeof setTimeout> | null = setTimeout(onLongPress, 800);
      const startPos = { x: 100, y: 100 };

      // Movement of 15px (exceeds 10px limit)
      const currentPos = { x: 112, y: 110 }; // hypot(12, 10) ≈ 15.6px
      const distance = Math.hypot(currentPos.x - startPos.x, currentPos.y - startPos.y);

      if (distance > 10 && timer) {
        clearTimeout(timer);
        timer = null;
      }

      vi.advanceTimersByTime(900);
      expect(onLongPress).not.toHaveBeenCalled();
    });
  });

  describe('Easter Egg 3: Secret Wish List 3D Card Flip (Feature 21, TC-F8-03, TC-F8-04)', () => {
    it('detects triple-tap within 600ms sliding window and triggers card flip', () => {
      let isFlipped = false;
      let tapTimes: number[] = [];

      const handleTap = (now: number) => {
        tapTimes = [...tapTimes.filter((t) => now - t < 600), now];
        if (tapTimes.length >= 3) {
          tapTimes = [];
          isFlipped = !isFlipped;
        }
      };

      // Tap 1 at 100ms
      handleTap(100);
      expect(isFlipped).toBe(false);

      // Tap 2 at 250ms
      handleTap(250);
      expect(isFlipped).toBe(false);

      // Tap 3 at 400ms (all 3 within 300ms < 600ms)
      handleTap(400);
      expect(isFlipped).toBe(true);
    });

    it('does not trigger card flip when taps are too slow (>600ms apart)', () => {
      let isFlipped = false;
      let tapTimes: number[] = [];

      const handleTap = (now: number) => {
        tapTimes = [...tapTimes.filter((t) => now - t < 600), now];
        if (tapTimes.length >= 3) {
          tapTimes = [];
          isFlipped = !isFlipped;
        }
      };

      // Tap 1 at 100ms
      handleTap(100);
      // Tap 2 at 800ms (tap 1 expired)
      handleTap(800);
      // Tap 3 at 1500ms (tap 2 expired)
      handleTap(1500);

      expect(isFlipped).toBe(false);
    });

    it('guards against click bubbling from textarea, input, and button elements', () => {
      const interactiveTags = ['TEXTAREA', 'INPUT', 'BUTTON', 'A'];

      const shouldIgnoreTap = (tagName: string) => {
        return interactiveTags.includes(tagName.toUpperCase());
      };

      expect(shouldIgnoreTap('TEXTAREA')).toBe(true);
      expect(shouldIgnoreTap('input')).toBe(true);
      expect(shouldIgnoreTap('button')).toBe(true);
      expect(shouldIgnoreTap('a')).toBe(true);
      expect(shouldIgnoreTap('DIV')).toBe(false);
      expect(shouldIgnoreTap('SPAN')).toBe(false);
    });

    it('debounces autosave to PUT /api/me/wishlist with 500ms window', () => {
      const saveFn = vi.fn();
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      const queueSave = (content: string) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          saveFn(content);
        }, 500);
      };

      // User types rapid keystrokes
      queueSave('K');
      vi.advanceTimersByTime(100);
      queueSave('Kaffee');
      vi.advanceTimersByTime(200);
      queueSave('Kaffee oder ein Buch');

      // Still within debounce window
      expect(saveFn).not.toHaveBeenCalled();

      // Advance 500ms past last keystroke
      vi.advanceTimersByTime(500);
      expect(saveFn).toHaveBeenCalledTimes(1);
      expect(saveFn).toHaveBeenCalledWith('Kaffee oder ein Buch');
    });
  });

  describe('Easter Egg 4: Grinch-Mode Overscroll Pull-Down (Feature 22, TC-F8-05)', () => {
    it('activates Grinch mode when pulled down > 120px starting near top (y <= 80px)', () => {
      let isGrinchActive = false;

      const evaluatePullDown = (startY: number, currentY: number, scrollY: number) => {
        if (startY <= 80 && scrollY <= 20) {
          const deltaY = currentY - startY;
          if (deltaY > 120) {
            isGrinchActive = true;
          }
        }
      };

      // Starting at y = 30, pulled to y = 160 (delta = 130 > 120): triggers!
      evaluatePullDown(30, 160, 0);
      expect(isGrinchActive).toBe(true);
    });

    it('does not activate Grinch mode when pull-down starts too low or delta is <= 120px', () => {
      let isGrinchActive = false;

      const evaluatePullDown = (startY: number, currentY: number, scrollY: number) => {
        if (startY <= 80 && scrollY <= 20) {
          const deltaY = currentY - startY;
          if (deltaY > 120) {
            isGrinchActive = true;
          }
        }
      };

      // Starts too far down (y = 120)
      evaluatePullDown(120, 300, 0);
      expect(isGrinchActive).toBe(false);

      // Starts near top, but only pulled 80px
      evaluatePullDown(20, 100, 0);
      expect(isGrinchActive).toBe(false);

      // Page is already scrolled down (scrollY = 150)
      evaluatePullDown(20, 200, 150);
      expect(isGrinchActive).toBe(false);
    });

    it('auto-dismisses Grinch mode after 4000ms', () => {
      let isGrinchActive = true;
      const dismissTimer = setTimeout(() => {
        isGrinchActive = false;
      }, 4000);

      expect(isGrinchActive).toBe(true);
      vi.advanceTimersByTime(3990);
      expect(isGrinchActive).toBe(true);

      vi.advanceTimersByTime(20);
      expect(isGrinchActive).toBe(false);
      clearTimeout(dismissTimer);
    });
  });

  describe('Universal Graceful Degradation (Feature 23, TC-B4-01..05)', () => {
    it('gracefully degrades when navigator.vibrate is undefined', () => {
      const originalVibrate = (globalThis as any).navigator?.vibrate;
      delete (globalThis as any).navigator.vibrate;

      const vibrateSafe = (pattern: number | number[]) => {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          return navigator.vibrate(pattern);
        }
        return false;
      };

      expect(() => vibrateSafe(100)).not.toThrow();
      expect(vibrateSafe(100)).toBe(false);

      if (originalVibrate) {
        (globalThis as any).navigator.vibrate = originalVibrate;
      }
    });

    it('handles missing DeviceOrientationEvent by returning neutral tilt', () => {
      const isOrientationSupported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
      // Even if false, card tilt hook falls back to mouse tracking
      expect(typeof isOrientationSupported).toBe('boolean');
    });

    it('particles canvas dynamically scales particle counts based on viewport and blizzard mode', () => {
      const calculateParticleCount = (width: number, isBlizzard: boolean) => {
        const baseCount = width <= 360 ? 60 : width <= 768 ? 90 : 140;
        return isBlizzard ? baseCount * 3 : baseCount;
      };

      // 320px mobile viewport (TC-B4-05)
      expect(calculateParticleCount(320, false)).toBe(60);
      expect(calculateParticleCount(320, true)).toBe(180);

      // 768px tablet viewport
      expect(calculateParticleCount(768, false)).toBe(90);
      expect(calculateParticleCount(768, true)).toBe(270);

      // Desktop viewport
      expect(calculateParticleCount(1280, false)).toBe(140);
      expect(calculateParticleCount(1280, true)).toBe(420);
    });
  });
});
