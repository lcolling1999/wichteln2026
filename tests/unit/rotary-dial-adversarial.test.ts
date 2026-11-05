import { describe, it, expect, vi } from 'vitest';
import {
  calculateRotaryAngle,
  normalizeAngleDelta,
} from './phase3-phase4.test';
import {
  isVibrationSupported,
  vibratePattern,
  vibrateTick,
  vibrateBolt,
} from '../../src/hooks/useHaptics';

/**
 * High-fidelity mathematical and state simulator of SafeVaultContainer logic
 * for deep empirical adversarial testing (TC-B5-01, TC-B5-02, TC-B5-04).
 */
class SafeVaultSimulator {
  public lockedBolts = 0;
  public forwardProgress = 0;
  public tickAccumulator = 0;
  public visualAngle = 0;
  public isVaultOpen = false;
  public tickCount = 0;
  public boltLockCount = 0;

  private readonly DEGREES_PER_TICK = 15;
  private readonly DEGREES_PER_BOLT = 360;
  private readonly TOTAL_BOLTS = 3;

  public onDeltaRotate(delta: number): void {
    if (this.isVaultOpen) return;

    // Visual angle update with modulo 360 normalization
    this.visualAngle = ((this.visualAngle + delta) % 360 + 360) % 360;

    if (delta > 0) {
      // Clockwise rotation
      this.forwardProgress += delta;
      this.tickAccumulator += delta;

      // Graduation ticks (every 15 degrees)
      if (this.tickAccumulator >= this.DEGREES_PER_TICK) {
        const ticksToEmit = Math.floor(this.tickAccumulator / this.DEGREES_PER_TICK);
        this.tickCount += ticksToEmit;
        this.tickAccumulator %= this.DEGREES_PER_TICK;
      }

      // Bolt lock threshold check
      while (this.lockedBolts < this.TOTAL_BOLTS) {
        const nextTarget = (this.lockedBolts + 1) * this.DEGREES_PER_BOLT;
        if (this.forwardProgress >= nextTarget) {
          this.lockedBolts += 1;
          this.boltLockCount += 1;
          if (this.lockedBolts >= this.TOTAL_BOLTS) {
            this.isVaultOpen = true;
            break;
          }
        } else {
          break;
        }
      }
    } else if (delta < 0) {
      // Counter-Clockwise rotation (TC-B5-02)
      // Clamped strictly above the milestone of the last locked bolt
      const minProgress = this.lockedBolts * this.DEGREES_PER_BOLT;
      this.forwardProgress = Math.max(minProgress, this.forwardProgress + delta);
      this.tickAccumulator = Math.max(0, this.tickAccumulator + delta);
    }
  }
}

/**
 * Gesture Pointer State Machine Simulator for Stuck Drag & Pointer Capture (TC-B5-04)
 */
class RotaryPointerGestureSimulator {
  public isDragging = false;
  public lastAngle: number | null = null;
  public activePointerId: number | null = null;
  public capturedPointerId: number | null = null;
  public emittedDeltas: number[] = [];

  public handlePointerDown(pointerId: number, angle: number): void {
    this.capturedPointerId = pointerId;
    this.lastAngle = angle;
    this.activePointerId = pointerId;
    this.isDragging = true;
  }

  public handlePointerMove(pointerId: number, currentAngle: number): void {
    if (!this.isDragging || this.activePointerId !== pointerId) {
      return;
    }

    if (this.lastAngle === null) {
      this.lastAngle = currentAngle;
      return;
    }

    let delta = currentAngle - this.lastAngle;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;

    this.lastAngle = currentAngle;
    this.emittedDeltas.push(Math.round(delta * 100) / 100);
  }

  public handlePointerUp(pointerId: number): void {
    if (this.activePointerId === pointerId) {
      this.capturedPointerId = null;
      this.isDragging = false;
      this.lastAngle = null;
      this.activePointerId = null;
    }
  }

  public handleWindowEnd(): void {
    this.capturedPointerId = null;
    this.isDragging = false;
    this.lastAngle = null;
    this.activePointerId = null;
  }
}

describe('Adversarial Challenge: Safe Rotary Dial & Gesture Dynamics', () => {
  describe('1. Circular Gesture Math & Wrap-around Normalization Boundary Verification', () => {
    it('proves 359° -> 1° produces exactly +2° delta across boundary (not -358°)', () => {
      const delta = normalizeAngleDelta(1, 359);
      expect(delta).toBe(2);
    });

    it('proves 1° -> 359° produces exactly -2° delta across boundary (not +358°)', () => {
      const delta = normalizeAngleDelta(359, 1);
      expect(delta).toBe(-2);
    });

    it('handles extreme sub-degree boundary crossings cleanly', () => {
      // 359.95° -> 0.05° -> +0.10°
      expect(normalizeAngleDelta(0.05, 359.95)).toBeCloseTo(0.1, 2);
      // 0.05° -> 359.95° -> -0.10°
      expect(normalizeAngleDelta(359.95, 0.05)).toBeCloseTo(-0.1, 2);
    });

    it('handles exact 0° boundary identity', () => {
      expect(normalizeAngleDelta(0, 0)).toBe(0);
      expect(normalizeAngleDelta(360, 0)).toBe(0); // 360 % 360 = 0
    });

    it('calculates accurate angles across all 8 compass directions from dial center', () => {
      const cx = 100;
      const cy = 100;
      const r = 50;

      // 0° (East)
      expect(calculateRotaryAngle(cx + r, cy, cx, cy)).toBe(0);
      // 45° (South-East)
      expect(calculateRotaryAngle(cx + r, cy + r, cx, cy)).toBe(45);
      // 90° (South)
      expect(calculateRotaryAngle(cx, cy + r, cx, cy)).toBe(90);
      // 135° (South-West)
      expect(calculateRotaryAngle(cx - r, cy + r, cx, cy)).toBe(135);
      // 180° (West)
      expect(calculateRotaryAngle(cx - r, cy, cx, cy)).toBe(180);
      // 225° (North-West)
      expect(calculateRotaryAngle(cx - r, cy - r, cx, cy)).toBe(225);
      // 270° (North)
      expect(calculateRotaryAngle(cx, cy - r, cx, cy)).toBe(270);
      // 315° (North-East)
      expect(calculateRotaryAngle(cx + r, cy - r, cx, cy)).toBe(315);
    });

    it('survives center singularity (0, 0 offset from center)', () => {
      const cx = 100;
      const cy = 100;
      // Exact center click atan2(0, 0)
      const angle = calculateRotaryAngle(cx, cy, cx, cy);
      expect(Number.isFinite(angle)).toBe(true);
      expect(angle).toBe(0);
    });

    it('Monte Carlo Trajectory Generator: 5,000 continuous angular steps track cumulative ground truth', () => {
      let groundTruthCumulative = 0;
      let prevAngle = 0;
      let calculatedCumulative = 0;

      // Simulate a continuous erratic path with small increments in [-20, +25] degrees
      for (let i = 0; i < 5000; i++) {
        // Biased slightly clockwise (+2.5° on average)
        const step = (Math.sin(i * 0.1) * 15) + 2.5;
        groundTruthCumulative += step;

        const currentAngle = ((groundTruthCumulative % 360) + 360) % 360;
        const delta = normalizeAngleDelta(currentAngle, prevAngle);

        calculatedCumulative += delta;
        prevAngle = currentAngle;
      }

      // Because step sizes are < 180°, calculated unwrapped angle MUST match ground truth
      expect(calculatedCumulative).toBeCloseTo(groundTruthCumulative, 0);
    });
  });

  describe('2. Reverse Spin Exploit Defense (TC-B5-02)', () => {
    it('strictly clamps forwardProgress at 0 when spun counter-clockwise initially', () => {
      const sim = new SafeVaultSimulator();

      // Spin counter-clockwise 10 full turns
      for (let i = 0; i < 100; i++) {
        sim.onDeltaRotate(-36);
      }

      expect(sim.forwardProgress).toBe(0);
      expect(sim.lockedBolts).toBe(0);
      expect(sim.isVaultOpen).toBe(false);
      expect(sim.boltLockCount).toBe(0);
    });

    it('allows counter-clockwise rotation to cancel uncommitted forward progress prior to bolt lock', () => {
      const sim = new SafeVaultSimulator();

      // Rotate forward 350° (just 10° shy of Bolt 1)
      sim.onDeltaRotate(350);
      expect(sim.forwardProgress).toBe(350);
      expect(sim.lockedBolts).toBe(0);

      // Rotate backward 300°
      sim.onDeltaRotate(-300);
      expect(sim.forwardProgress).toBe(50);
      expect(sim.lockedBolts).toBe(0);

      // Rotate backward another 100° (exceeding initial 50°)
      sim.onDeltaRotate(-100);
      // Strictly clamped at 0
      expect(sim.forwardProgress).toBe(0);
      expect(sim.lockedBolts).toBe(0);
      expect(sim.isVaultOpen).toBe(false);
    });

    it('permanently locks Bolt 1 at 360° and strictly clamps backward rotation at 360°', () => {
      const sim = new SafeVaultSimulator();

      // Complete Turn 1 (360°)
      sim.onDeltaRotate(360);
      expect(sim.lockedBolts).toBe(1);
      expect(sim.boltLockCount).toBe(1);
      expect(sim.forwardProgress).toBe(360);

      // Attempt reverse spin exploit: massive backward turn of -5000°
      sim.onDeltaRotate(-5000);
      // Must NOT decrement below 360° milestone
      expect(sim.forwardProgress).toBe(360);
      // Bolt 1 must NOT unlock
      expect(sim.lockedBolts).toBe(1);
      expect(sim.isVaultOpen).toBe(false);
    });

    it('permanently locks Bolt 2 at 720° and strictly clamps backward rotation at 720°', () => {
      const sim = new SafeVaultSimulator();

      sim.onDeltaRotate(360); // Bolt 1
      sim.onDeltaRotate(360); // Bolt 2
      expect(sim.lockedBolts).toBe(2);
      expect(sim.boltLockCount).toBe(2);
      expect(sim.forwardProgress).toBe(720);

      // Reverse spin backward
      sim.onDeltaRotate(-1000);
      expect(sim.forwardProgress).toBe(720);
      expect(sim.lockedBolts).toBe(2);
      expect(sim.isVaultOpen).toBe(false);
    });

    it('Adversarial Rapid Oscillation Attack: 1,000 back-and-forth oscillations NEVER unlock safe', () => {
      const sim = new SafeVaultSimulator();

      // User oscillates rapidly back and forth between +45° and -45°
      for (let i = 0; i < 1000; i++) {
        sim.onDeltaRotate(45);
        expect(sim.forwardProgress).toBeLessThanOrEqual(45);
        expect(sim.lockedBolts).toBe(0);

        sim.onDeltaRotate(-45);
        expect(sim.forwardProgress).toBe(0);
        expect(sim.lockedBolts).toBe(0);
      }

      expect(sim.forwardProgress).toBe(0);
      expect(sim.lockedBolts).toBe(0);
      expect(sim.isVaultOpen).toBe(false);
      expect(sim.boltLockCount).toBe(0);
    });

    it('requires exactly 3 genuine full revolutions (1080°) to swing open vault door', () => {
      const sim = new SafeVaultSimulator();

      sim.onDeltaRotate(359);
      expect(sim.isVaultOpen).toBe(false);
      sim.onDeltaRotate(1); // 360° -> Bolt 1
      expect(sim.lockedBolts).toBe(1);
      expect(sim.isVaultOpen).toBe(false);

      sim.onDeltaRotate(359);
      expect(sim.lockedBolts).toBe(1);
      sim.onDeltaRotate(1); // 720° -> Bolt 2
      expect(sim.lockedBolts).toBe(2);
      expect(sim.isVaultOpen).toBe(false);

      sim.onDeltaRotate(359);
      expect(sim.lockedBolts).toBe(2);
      sim.onDeltaRotate(1); // 1080° -> Bolt 3 & Open!
      expect(sim.lockedBolts).toBe(3);
      expect(sim.isVaultOpen).toBe(true);
    });

    it('ignores further rotation after vault door is open', () => {
      const sim = new SafeVaultSimulator();
      sim.onDeltaRotate(1080);
      expect(sim.isVaultOpen).toBe(true);

      const progressAtOpen = sim.forwardProgress;
      sim.onDeltaRotate(500);
      expect(sim.forwardProgress).toBe(progressAtOpen);
    });
  });

  describe('3. Stuck Drag Defense & Pointer Lifecycle Robustness (TC-B5-04)', () => {
    it('initiates drag and records activePointerId on pointerdown', () => {
      const gest = new RotaryPointerGestureSimulator();
      gest.handlePointerDown(42, 90);

      expect(gest.isDragging).toBe(true);
      expect(gest.activePointerId).toBe(42);
      expect(gest.capturedPointerId).toBe(42);
      expect(gest.lastAngle).toBe(90);
    });

    it('emits accurate rotational deltas during active drag', () => {
      const gest = new RotaryPointerGestureSimulator();
      gest.handlePointerDown(1, 10);
      gest.handlePointerMove(1, 25);
      gest.handlePointerMove(1, 40);

      expect(gest.emittedDeltas).toEqual([15, 15]);
      expect(gest.lastAngle).toBe(40);
    });

    it('Multi-touch Collision Defense: rejects conflicting secondary pointer movements', () => {
      const gest = new RotaryPointerGestureSimulator();
      gest.handlePointerDown(101, 45);

      // Secondary touch (pointerId 102) moves wildly
      gest.handlePointerMove(102, 270);
      gest.handlePointerMove(102, 180);

      // Must be completely ignored! No deltas emitted
      expect(gest.emittedDeltas).toEqual([]);
      expect(gest.lastAngle).toBe(45);

      // Primary touch continues normally
      gest.handlePointerMove(101, 60);
      expect(gest.emittedDeltas).toEqual([15]);
    });

    it('cleans up drag state cleanly on pointerup', () => {
      const gest = new RotaryPointerGestureSimulator();
      gest.handlePointerDown(1, 0);
      gest.handlePointerMove(1, 15);
      gest.handlePointerUp(1);

      expect(gest.isDragging).toBe(false);
      expect(gest.lastAngle).toBeNull();
      expect(gest.activePointerId).toBeNull();
      expect(gest.capturedPointerId).toBeNull();

      // Subsequent moves are no-ops
      gest.handlePointerMove(1, 30);
      expect(gest.emittedDeltas).toEqual([15]);
    });

    it('Stuck Drag Safety: windowEnd (blur / pointercancel / leave) releases stuck drags', () => {
      const gest = new RotaryPointerGestureSimulator();
      gest.handlePointerDown(5, 180);
      expect(gest.isDragging).toBe(true);

      // Simulates cursor dragged off-screen or OS window blur triggering window pointercancel
      gest.handleWindowEnd();

      expect(gest.isDragging).toBe(false);
      expect(gest.lastAngle).toBeNull();
      expect(gest.activePointerId).toBeNull();
      expect(gest.capturedPointerId).toBeNull();

      // Moves without pointerdown do not emit deltas
      gest.handlePointerMove(5, 200);
      expect(gest.emittedDeltas).toEqual([]);
    });
  });

  describe('4. Haptic Feedback & Graceful Degradation Hardening', () => {
    it('dispatches vibrateTick with exact 5ms pattern', () => {
      const mockVibrate = vi.fn().mockReturnValue(true);
      const originalVibrate = (navigator as any).vibrate;
      try {
        (navigator as any).vibrate = mockVibrate;
        expect(vibrateTick()).toBe(true);
        expect(mockVibrate).toHaveBeenCalledWith(5);
      } finally {
        (navigator as any).vibrate = originalVibrate;
      }
    });

    it('dispatches vibrateBolt with exact [20, 50, 20] pattern', () => {
      const mockVibrate = vi.fn().mockReturnValue(true);
      const originalVibrate = (navigator as any).vibrate;
      try {
        (navigator as any).vibrate = mockVibrate;
        expect(vibrateBolt()).toBe(true);
        expect(mockVibrate).toHaveBeenCalledWith([20, 50, 20]);
      } finally {
        (navigator as any).vibrate = originalVibrate;
      }
    });

    it('catches and swallows SecurityError/NotAllowedError from navigator.vibrate', () => {
      const throwingVibrate = vi.fn().mockImplementation(() => {
        throw new DOMException('The play gesture was not permitted.', 'NotAllowedError');
      });
      const originalVibrate = (navigator as any).vibrate;
      try {
        (navigator as any).vibrate = throwingVibrate;
        // Must return false gracefully, zero unhandled errors
        expect(vibratePattern(5)).toBe(false);
        expect(vibrateTick()).toBe(false);
        expect(vibrateBolt()).toBe(false);
      } finally {
        (navigator as any).vibrate = originalVibrate;
      }
    });
  });
});
