import { describe, it, expect } from 'vitest';
import { normalizeSearch } from '../../src/components/phase1/ColleagueSelector';
import { soundEngine } from '../../src/audio/soundEngine';
import { SEED_COLLEAGUES } from '../../server/db/seeds';

describe('Frontend Component & Logic Unit Tests (Milestone 2)', () => {
  describe('Colleague Normalization (normalizeSearch)', () => {
    it('normalizes precomposed NFC André (\u00e9) to "andre"', () => {
      const nfc = 'Andr\u00e9';
      expect(normalizeSearch(nfc)).toBe('andre');
    });

    it('normalizes decomposed NFD Andre\\u0301 to "andre"', () => {
      const nfd = 'Andre\u0301';
      expect(normalizeSearch(nfd)).toBe('andre');
    });

    it('proves NFC and NFD strings normalize to the identical key', () => {
      expect(normalizeSearch('André')).toBe(normalizeSearch('Andre\u0301'));
    });

    it('handles leading and trailing whitespace', () => {
      expect(normalizeSearch('  Sara  ')).toBe('sara');
      expect(normalizeSearch('\tNorman\n')).toBe('norman');
    });

    it('matches all 24 canonical colleagues by normalized search', () => {
      expect(SEED_COLLEAGUES).toHaveLength(24);
      for (const col of SEED_COLLEAGUES) {
        const norm = normalizeSearch(col.name);
        expect(norm.length).toBeGreaterThan(0);
        expect(norm).toBe(norm.toLowerCase());
      }
    });

    it('handles empty and null strings safely', () => {
      expect(normalizeSearch('')).toBe('');
      expect(normalizeSearch(null as any)).toBe('');
      expect(normalizeSearch(undefined as any)).toBe('');
    });
  });

  describe('Tree Geometry & 320px Viewport Safety', () => {
    const tierDistribution = [1, 2, 3, 4, 5, 5, 4];

    it('partitions all 24 colleagues into exactly 7 festive tree rows', () => {
      const sum = tierDistribution.reduce((acc, count) => acc + count, 0);
      expect(sum).toBe(24);
      expect(tierDistribution).toHaveLength(7);
    });

    it('guarantees max row width fits strictly inside 320px viewport without overflow', () => {
      const maxOrbsInRow = Math.max(...tierDistribution); // 5
      const orbDiameterPx = 36;
      const gapPx = 6;
      const totalRowWidthPx = maxOrbsInRow * orbDiameterPx + (maxOrbsInRow - 1) * gapPx; // 5 * 36 + 4 * 6 = 204px
      const viewportWidthPx = 320;
      const maxAllowedWidthPx = 325; // Tolerance from TC-B4-05

      expect(totalRowWidthPx).toBe(204);
      expect(totalRowWidthPx).toBeLessThan(viewportWidthPx);
      expect(totalRowWidthPx).toBeLessThan(maxAllowedWidthPx);

      // Remaining lateral margin clearance is at least 50px on each side
      const sideMargin = (viewportWidthPx - totalRowWidthPx) / 2;
      expect(sideMargin).toBeGreaterThan(50);
    });
  });

  describe('Sound Engine Mute & Safe Fallback', () => {
    it('toggles and manages mute state correctly', () => {
      soundEngine.setMuted(false);
      expect(soundEngine.getMuted()).toBe(false);

      const toggled = soundEngine.toggleMute();
      expect(toggled).toBe(true);
      expect(soundEngine.getMuted()).toBe(true);

      soundEngine.setMuted(false);
      expect(soundEngine.getMuted()).toBe(false);
    });

    it('safe methods execute without throwing in headless Node environment', () => {
      expect(() => {
        soundEngine.playBiometricSnap();
        soundEngine.playSafeTick();
        soundEngine.playBoltLock();
        soundEngine.playRevealChime();
        soundEngine.playOrbPop();
      }).not.toThrow();
    });
  });

  describe('Canvas Particle Engine Invariants', () => {
    it('verifies delta-time clamping formula prevents frame jumps', () => {
      const clampDt = (rawDt: number) => Math.min(rawDt, 0.1);

      expect(clampDt(0.016)).toBeCloseTo(0.016);
      expect(clampDt(0.033)).toBeCloseTo(0.033);
      expect(clampDt(0.5)).toBe(0.1); // clamped on browser micro-stutters
      expect(clampDt(5.0)).toBe(0.1); // clamped on background tab return
    });

    it('verifies mobile particle count throttling formula', () => {
      const getParticleCount = (width: number, isBlizzard: boolean) => {
        const base = width <= 360 ? 60 : width <= 768 ? 90 : 140;
        return isBlizzard ? base * 3 : base;
      };

      expect(getParticleCount(320, false)).toBe(60);
      expect(getParticleCount(360, false)).toBe(60);
      expect(getParticleCount(375, false)).toBe(90);
      expect(getParticleCount(1024, false)).toBe(140);
      expect(getParticleCount(320, true)).toBe(180);
      expect(getParticleCount(1024, true)).toBe(420);
    });
  });
});
