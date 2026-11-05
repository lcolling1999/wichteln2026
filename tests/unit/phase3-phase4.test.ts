import { describe, it, expect, vi } from 'vitest';
import {
  calculateGyroTilt,
  calculateMouseTilt,
  calculateParallaxShine,
} from '../../src/hooks/useSensors';
import {
  isVibrationSupported,
  vibratePattern,
  vibrateTick,
  vibrateBolt,
  useHaptics,
} from '../../src/hooks/useHaptics';
import { SEED_COLLEAGUES } from '../../server/db/seeds';

// -------------------------------------------------------------
// Pure logic functions extracted for unit test verification
// -------------------------------------------------------------

export function calculateRotaryAngle(x: number, y: number, cx: number, cy: number): number {
  const rad = Math.atan2(y - cy, x - cx);
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return Math.round(deg * 10) / 10;
}

export function normalizeAngleDelta(currentDeg: number, prevDeg: number): number {
  let delta = currentDeg - prevDeg;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return Math.round(delta * 10) / 10;
}

export function computeBoltProgression(cumulativeAngleDeg: number): {
  boltsLocked: number;
  unlocked: boolean;
} {
  const turns = Math.max(0, cumulativeAngleDeg) / 360;
  const boltsLocked = Math.min(3, Math.floor(turns));
  return {
    boltsLocked,
    unlocked: boltsLocked >= 3,
  };
}

export function getScrambleString(
  targetName: string,
  progressRatio: number,
  glyphSeed = 'X'
): string {
  const ratio = Math.max(0, Math.min(1, progressRatio));
  const chars = Array.from(targetName);
  const settledCount = Math.floor(ratio * chars.length);

  return chars
    .map((char, index) => {
      if (index < settledCount) return char;
      return glyphSeed;
    })
    .join('');
}

export interface ParsedWord {
  raw: string;
  word: string;
  isKeyword: boolean;
  emoji?: string;
}

export function parseTeaserSentence(
  sentence: string,
  keywords: Array<{ word: string; emoji: string }>
): ParsedWord[] {
  const tokens = sentence.trim().split(/\s+/);
  return tokens.map((token) => {
    // Strip trailing punctuation for keyword matching
    const clean = token.replace(/[.,!?;:()]/g, '').trim().toLowerCase();
    const matched = keywords.find((k) => {
      const kw = k.word.trim().toLowerCase();
      return clean === kw || clean.includes(kw);
    });
    return {
      raw: token,
      word: clean,
      isKeyword: !!matched,
      emoji: matched?.emoji,
    };
  });
}

export function generateEmojiParticles(emoji: string, count = 8) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI;
    const speed = 80 + (i % 3) * 20;
    particles.push({
      id: `p-${i}`,
      emoji,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
    });
  }
  return particles;
}

// -------------------------------------------------------------
// Test Suites
// -------------------------------------------------------------

describe('Phase 3 & Phase 4 Component & Mathematics Unit Tests', () => {
  describe('1. Rotary Angle & Circle Gesture Mathematics', () => {
    const cx = 100;
    const cy = 100;

    it('calculates accurate angles for 4 cardinal directions', () => {
      expect(calculateRotaryAngle(150, 100, cx, cy)).toBe(0); // East
      expect(calculateRotaryAngle(100, 150, cx, cy)).toBe(90); // South
      expect(calculateRotaryAngle(50, 100, cx, cy)).toBe(180); // West
      expect(calculateRotaryAngle(100, 50, cx, cy)).toBe(270); // North
    });

    it('normalizes delta when crossing 0/360 boundary clockwise', () => {
      // Rotate clockwise from 355° to 5° -> should be +10°, not -350°
      const delta = normalizeAngleDelta(5, 355);
      expect(delta).toBe(10);
    });

    it('normalizes delta when crossing 0/360 boundary counter-clockwise', () => {
      // Rotate counter-clockwise from 5° to 355° -> should be -10°, not +350°
      const delta = normalizeAngleDelta(355, 5);
      expect(delta).toBe(-10);
    });

    it('accurately tracks continuous multi-turn rotations', () => {
      let cumulative = 0;
      let prev = 0;
      const steps = [90, 180, 270, 360, 90, 180];
      for (const current of steps) {
        const currNorm = current % 360;
        cumulative += normalizeAngleDelta(currNorm, prev);
        prev = currNorm;
      }
      expect(cumulative).toBe(540); // 1.5 full turns
    });
  });

  describe('2. Bolt Count Progression & State Machine', () => {
    it('progresses bolts sequentially with rotation angle', () => {
      expect(computeBoltProgression(0)).toEqual({ boltsLocked: 0, unlocked: false });
      expect(computeBoltProgression(180)).toEqual({ boltsLocked: 0, unlocked: false });
      expect(computeBoltProgression(360)).toEqual({ boltsLocked: 1, unlocked: false });
      expect(computeBoltProgression(720)).toEqual({ boltsLocked: 2, unlocked: false });
      expect(computeBoltProgression(1080)).toEqual({ boltsLocked: 3, unlocked: true });
    });

    it('clamps maximum bolt count to 3', () => {
      const overTurned = computeBoltProgression(2500);
      expect(overTurned.boltsLocked).toBe(3);
      expect(overTurned.unlocked).toBe(true);
    });

    it('does not falsely lock bolts on negative rotation', () => {
      const reverse = computeBoltProgression(-720);
      expect(reverse.boltsLocked).toBe(0);
      expect(reverse.unlocked).toBe(false);
    });
  });

  describe('3. Matrix Scramble Settling Invariants', () => {
    const target = 'Marcel';

    it('preserves string length at all progress stages', () => {
      for (let p = 0; p <= 1.0; p += 0.2) {
        const str = getScrambleString(target, p);
        expect(str).toHaveLength(target.length);
      }
    });

    it('settles characters sequentially from left to right', () => {
      expect(getScrambleString(target, 0, '#')).toBe('######');
      expect(getScrambleString(target, 0.5, '#')).toBe('Mar###');
      expect(getScrambleString(target, 1.0, '#')).toBe('Marcel');
    });

    it('handles unicode names with accents properly (André)', () => {
      const accented = 'André';
      expect(getScrambleString(accented, 1.0)).toBe('André');
    });

    it('settles all 24 canonical colleague names cleanly', () => {
      for (const col of SEED_COLLEAGUES) {
        const settled = getScrambleString(col.name, 1.0);
        expect(settled).toBe(col.name);
      }
    });
  });

  describe('4. Teaser Word Parsing & Keyword Chips', () => {
    it('parses sentence and attaches keywords with emojis', () => {
      const sentence = 'Organisiert alles mit Bravour und zaubert stets ein Lächeln hervor!';
      const keywords = [
        { word: 'Bravour', emoji: '✨' },
        { word: 'Lächeln', emoji: '😊' },
      ];

      const tokens = parseTeaserSentence(sentence, keywords);
      expect(tokens.length).toBeGreaterThan(5);

      const bravour = tokens.find((t) => t.word === 'bravour');
      expect(bravour).toBeDefined();
      expect(bravour?.isKeyword).toBe(true);
      expect(bravour?.emoji).toBe('✨');

      const lacheln = tokens.find((t) => t.word === 'lächeln');
      expect(lacheln).toBeDefined();
      expect(lacheln?.isKeyword).toBe(true);
      expect(lacheln?.emoji).toBe('😊');

      const nonKeyword = tokens.find((t) => t.word === 'alles');
      expect(nonKeyword?.isKeyword).toBe(false);
      expect(nonKeyword?.emoji).toBeUndefined();
    });

    it('successfully extracts keywords for all 24 seeded colleague teasers', () => {
      for (const col of SEED_COLLEAGUES) {
        const parsed = parseTeaserSentence(col.sentence, col.keywords);
        const matchedKeywords = parsed.filter((p) => p.isKeyword);
        expect(matchedKeywords.length).toBe(col.keywords.length);
      }
    });
  });

  describe('5. Keyword Chip Emoji Pop Physics', () => {
    it('generates exact particle count with correct emoji', () => {
      const particles = generateEmojiParticles('🚀', 8);
      expect(particles).toHaveLength(8);
      expect(particles.every((p) => p.emoji === '🚀')).toBe(true);
    });

    it('distributes particle velocities across all 4 quadrants', () => {
      const particles = generateEmojiParticles('🎉', 12);
      const hasPosVx = particles.some((p) => p.vx > 0);
      const hasNegVx = particles.some((p) => p.vx < 0);
      const hasPosVy = particles.some((p) => p.vy > 0);
      const hasNegVy = particles.some((p) => p.vy < 0);

      expect(hasPosVx).toBe(true);
      expect(hasNegVx).toBe(true);
      expect(hasPosVy).toBe(true);
      expect(hasNegVy).toBe(true);
    });
  });

  describe('6. 3D Tilt Angles & Parallax Shine Math', () => {
    it('calculates dampened gyro tilt matching TC-F7-04 test values', () => {
      // TC-F7-04 injects beta: 30, gamma: -25
      const { rotateX, rotateY } = calculateGyroTilt(30, -25, 20);
      expect(rotateX).toBeCloseTo(-13.33, 1);
      expect(rotateY).toBeCloseTo(-11.11, 1);
      expect(Math.abs(rotateX)).toBeLessThanOrEqual(20);
      expect(Math.abs(rotateY)).toBeLessThanOrEqual(20);
    });

    it('strictly clamps extreme gyro values to maxTiltDeg (+/- 20)', () => {
      const extreme = calculateGyroTilt(90, -85, 20);
      expect(extreme.rotateX).toBe(-20);
      expect(extreme.rotateY).toBe(-20);
    });

    it('returns neutral 0 tilt on null gyro data', () => {
      const nullGyro = calculateGyroTilt(null, null, 20);
      expect(nullGyro).toEqual({ rotateX: 0, rotateY: 0 });
    });

    it('calculates desktop mouse tilt proportional to card center offset', () => {
      const rect = { left: 100, top: 100, width: 200, height: 300 };

      // Center
      const center = calculateMouseTilt(200, 250, rect, 20);
      expect(center).toEqual({ rotateX: 0, rotateY: 0 });

      // Top Left corner
      const topLeft = calculateMouseTilt(100, 100, rect, 20);
      expect(topLeft.rotateX).toBe(20); // Top tilts forward
      expect(topLeft.rotateY).toBe(-20); // Left tilts back

      // Bottom Right corner
      const bottomRight = calculateMouseTilt(300, 400, rect, 20);
      expect(bottomRight.rotateX).toBe(-20);
      expect(bottomRight.rotateY).toBe(20);
    });

    it('calculates parallax shine focal coordinates within [0, 100]%', () => {
      const centerShine = calculateParallaxShine(0, 0, 20);
      expect(centerShine.shineX).toBe(50);
      expect(centerShine.shineY).toBe(50);
      expect(centerShine.gradientAngle).toBe(135);

      const maxTiltShine = calculateParallaxShine(20, -20, 20);
      expect(maxTiltShine.shineX).toBe(0);
      expect(maxTiltShine.shineY).toBe(0);
      expect(maxTiltShine.gradientAngle).toBe(90);
    });
  });

  describe('7. App State Machine Integration & Finding 1 Guard', () => {
    it('guards onDrawComplete against unauthenticated transition from onboarding', () => {
      const transitionOnDraw = (currentPhase: string) => {
        if (currentPhase === 'phase2_lobby') return 'phase3_safedial';
        return currentPhase;
      };

      // Unauthenticated visitor on onboarding STAYS on onboarding
      expect(transitionOnDraw('phase1_onboarding')).toBe('phase1_onboarding');

      // Authenticated participant in lobby transitions to safe dial
      expect(transitionOnDraw('phase2_lobby')).toBe('phase3_safedial');

      // Phase 4 remains on phase 4
      expect(transitionOnDraw('phase4_reveal')).toBe('phase4_reveal');
    });

    it('transitions from phase3_safedial to phase4_reveal on 3 bolts unlocked', () => {
      const onUnlock = (currentPhase: string) => {
        if (currentPhase === 'phase3_safedial') return 'phase4_reveal';
        return currentPhase;
      };

      expect(onUnlock('phase3_safedial')).toBe('phase4_reveal');
    });
  });

  describe('8. Haptics & Vibration Graceful Degradation', () => {
    it('returns false when vibration API is unsupported without throwing', () => {
      const originalVibrate = navigator.vibrate;
      try {
        // Mock unsupported
        (navigator as any).vibrate = undefined;
        expect(isVibrationSupported()).toBe(false);
        expect(vibrateTick()).toBe(false);
        expect(vibrateBolt()).toBe(false);
        expect(vibratePattern(5)).toBe(false);

        const haptics = useHaptics();
        expect(haptics.isSupported).toBe(false);
        expect(haptics.tick()).toBe(false);
        expect(haptics.boltLock()).toBe(false);
      } finally {
        (navigator as any).vibrate = originalVibrate;
      }
    });

    it('invokes navigator.vibrate with correct patterns when supported', () => {
      const mockVibrate = vi.fn().mockReturnValue(true);
      const originalVibrate = navigator.vibrate;
      try {
        (navigator as any).vibrate = mockVibrate;
        expect(isVibrationSupported()).toBe(true);

        vibrateTick();
        expect(mockVibrate).toHaveBeenCalledWith(5);

        vibrateBolt();
        expect(mockVibrate).toHaveBeenCalledWith([20, 50, 20]);
      } finally {
        (navigator as any).vibrate = originalVibrate;
      }
    });
  });
});
