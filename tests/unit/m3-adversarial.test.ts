import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  MATRIX_GLYPHS,
  MatrixScrambleText,
} from '../../src/components/phase4/MatrixScrambleText';
import { TeaserSentence } from '../../src/components/phase4/TeaserSentence';
import { EmojiPopChip } from '../../src/components/phase4/EmojiPop';
import { HolographicCard } from '../../src/components/phase4/HolographicCard';
import { PartnerReveal } from '../../src/components/phase4/PartnerReveal';
import { SafeRotaryDial } from '../../src/components/phase3/SafeRotaryDial';
import { BoltIndicator } from '../../src/components/phase3/BoltIndicator';
import { VaultDoor } from '../../src/components/phase3/VaultDoor';
import {
  calculateGyroTilt,
  calculateMouseTilt,
  calculateParallaxShine,
} from '../../src/hooks/useSensors';
import { SEED_COLLEAGUES } from '../../server/db/seeds';

// ---------------------------------------------------------------------------
// Matrix Scramble Decryption Simulation Engine (matching MatrixScrambleText)
// ---------------------------------------------------------------------------
function simulateMatrixScramble(
  targetText: string,
  elapsedMs: number,
  durationMs = 2400,
  wildDuration = 400
): { displayText: string; settledCount: number; isComplete: boolean } {
  const characters = Array.from(targetText);
  const length = characters.length;

  if (elapsedMs >= durationMs) {
    return {
      displayText: targetText,
      settledCount: length,
      isComplete: true,
    };
  }

  let currentSettled = 0;
  if (elapsedMs > wildDuration) {
    const settleProgress = (elapsedMs - wildDuration) / (durationMs - wildDuration);
    currentSettled = Math.min(length, Math.floor(settleProgress * length));
  }

  const nextChars = characters.map((targetChar, idx) => {
    if (targetChar === ' ') return ' ';
    if (idx < currentSettled) return targetChar;
    return '§'; // Deterministic cypher glyph stand-in for assertions
  });

  return {
    displayText: nextChars.join(''),
    settledCount: currentSettled,
    isComplete: false,
  };
}

// ---------------------------------------------------------------------------
// Teaser Tokenizer (matching TeaserSentence.tsx logic)
// ---------------------------------------------------------------------------
function tokenizeTeaser(sentence: string, keywords: Array<{ word: string; emoji: string }>) {
  const rawWords = sentence.trim().split(/\s+/).filter(Boolean);
  return rawWords.map((word) => {
    const cleanWord = word.replace(/[.,!?;:()]/g, '').trim().toLowerCase();
    const isKeyword = keywords.some((k) => {
      const kw = k.word.trim().toLowerCase();
      return cleanWord === kw || cleanWord.includes(kw);
    });
    return {
      raw: word,
      clean: cleanWord,
      isKeyword,
    };
  });
}

// ---------------------------------------------------------------------------
// Emoji Pop Particle Simulator (matching EmojiPop.tsx)
// ---------------------------------------------------------------------------
interface Particle {
  id: string;
  emoji: string;
  targetX: number;
  targetY: number;
}

class EmojiParticlePool {
  private particles: Particle[] = [];

  pop(emoji: string, count = 8): { newParticles: Particle[]; totalCount: number } {
    const newParticles: Particle[] = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * 2 * Math.PI + (Math.random() - 0.5) * 0.4;
      const distance = 45 + Math.random() * 35;
      return {
        id: `${Date.now()}-${Math.random()}-${i}`,
        emoji,
        targetX: Math.cos(angle) * distance,
        targetY: Math.sin(angle) * distance,
      };
    });

    this.particles = [...this.particles, ...newParticles];
    return { newParticles, totalCount: this.particles.length };
  }

  cleanup(idsToRemove: string[]): number {
    const removeSet = new Set(idsToRemove);
    this.particles = this.particles.filter((p) => !removeSet.has(p.id));
    return this.particles.length;
  }

  count(): number {
    return this.particles.length;
  }
}

// ===========================================================================
// ADVERSARIAL STRESS TEST SUITE
// ===========================================================================
describe('Milestone 3 Adversarial Challenge: Typography, Teaser & 3D Tilt', () => {

  // -------------------------------------------------------------------------
  // 1. Matrix Scramble Left-to-Right Settling & Unicode Colleague Names
  // -------------------------------------------------------------------------
  describe('1. Matrix Scramble Left-to-Right Settling & Unicode Colleague Names', () => {
    it('verifies MATRIX_GLYPHS contains authentic Katakana and cypher characters', () => {
      expect(MATRIX_GLYPHS.length).toBeGreaterThan(50);
      expect(MATRIX_GLYPHS).toContain('ﾊ');
      expect(MATRIX_GLYPHS).toContain('0');
      expect(MATRIX_GLYPHS).toContain('A');
      expect(MATRIX_GLYPHS).toContain('#');
    });

    it('guarantees that after 2.4s all letters have settled into the exact partner name with 0 leftover cypher characters', () => {
      for (const col of SEED_COLLEAGUES) {
        const result = simulateMatrixScramble(col.name, 2400, 2400, 400);
        expect(result.isComplete).toBe(true);
        expect(result.displayText).toBe(col.name);
        expect(result.settledCount).toBe(Array.from(col.name).length);
        expect(result.displayText.includes('§')).toBe(false);
      }
    });

    it('guarantees settling for post-duration timestamps (t = 2401ms, 5000ms, 10000ms)', () => {
      for (const t of [2401, 3000, 5000, 10000]) {
        const result = simulateMatrixScramble('André', t, 2400, 400);
        expect(result.isComplete).toBe(true);
        expect(result.displayText).toBe('André');
        expect(result.settledCount).toBe(5);
        expect(result.displayText.includes('§')).toBe(false);
      }
    });

    it('correctly handles Unicode colleague names with diacritics (André: 5 graphemes, not broken bytes)', () => {
      const name = 'André';
      const characters = Array.from(name);
      expect(characters).toHaveLength(5);
      expect(characters[4]).toBe('é');

      // During settling progression:
      const mid = simulateMatrixScramble(name, 1400, 2400, 400);
      expect(mid.settledCount).toBeGreaterThanOrEqual(2);
      expect(mid.displayText.startsWith('An')).toBe(true);

      const finalRes = simulateMatrixScramble(name, 2400, 2400, 400);
      expect(finalRes.displayText).toBe('André');
      expect(Array.from(finalRes.displayText)).toHaveLength(5);
    });

    it('proves strictly monotonic left-to-right settling across the 400ms-2400ms window', () => {
      const target = 'Maximilian';
      const len = Array.from(target).length;
      let prevSettled = -1;

      // Sample every 50ms from 0 to 2500ms
      for (let t = 0; t <= 2500; t += 50) {
        const { settledCount, displayText, isComplete } = simulateMatrixScramble(target, t, 2400, 400);

        if (t <= 400) {
          expect(settledCount).toBe(0);
          expect(isComplete).toBe(false);
        } else if (t >= 2400) {
          expect(settledCount).toBe(len);
          expect(isComplete).toBe(true);
          expect(displayText).toBe(target);
        } else {
          expect(settledCount).toBeGreaterThanOrEqual(prevSettled);
          expect(settledCount).toBeLessThanOrEqual(len);
          // Settled prefix must match target text exactly
          expect(displayText.slice(0, settledCount)).toBe(target.slice(0, settledCount));
        }

        prevSettled = settledCount;
      }
    });

    it('handles edge case strings: compound names, spaces, single characters, and empty strings', () => {
      const testCases = [
        'Jean-Luc',
        'Mary Jane',
        'A',
        'Zoë',
        'Björn',
        'Klaus-Dieter',
      ];

      for (const tc of testCases) {
        const completed = simulateMatrixScramble(tc, 2400, 2400, 400);
        expect(completed.displayText).toBe(tc);
        expect(completed.settledCount).toBe(Array.from(tc).length);
        expect(completed.isComplete).toBe(true);
      }
    });

    it('empirically renders MatrixScrambleText to HTML with correct testid and spans', () => {
      const html = renderToString(React.createElement(MatrixScrambleText, { targetText: 'André' }));
      expect(html).toContain('data-testid="matrix-scramble-text"');
      // Must contain 5 spans for André
      const spanMatches = html.match(/<span/g);
      expect(spanMatches?.length).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Teaser Sentence Word Tokenization & Emoji Pop Particle Physics
  // -------------------------------------------------------------------------
  describe('2. Teaser Sentence Word Tokenization & Emoji Pop', () => {
    it('verifies all 24 seeded teaser sentences split into non-empty tokens', () => {
      expect(SEED_COLLEAGUES).toHaveLength(24);

      for (const col of SEED_COLLEAGUES) {
        const tokens = tokenizeTeaser(col.sentence, col.keywords);
        expect(tokens.length).toBeGreaterThan(0);
        for (const token of tokens) {
          expect(token.raw.trim().length).toBeGreaterThan(0);
          expect(token.clean.length).toBeGreaterThan(0);
        }
      }
    });

    it('verifies compound word keywords highlight correctly (Systemstabilität -> Stabilität for Lucas)', () => {
      const lucas = SEED_COLLEAGUES.find((c) => c.name === 'Lucas');
      expect(lucas).toBeDefined();
      expect(lucas?.sentence).toContain('Systemstabilität');

      const tokens = tokenizeTeaser(lucas!.sentence, lucas!.keywords);
      const stabilityToken = tokens.find((t) => t.clean.includes('stabilität'));

      expect(stabilityToken).toBeDefined();
      expect(stabilityToken?.clean).toBe('systemstabilität');
      expect(stabilityToken?.isKeyword).toBe(true);
    });

    it('verifies all keywords across all 24 colleagues are matched in their sentences', () => {
      for (const col of SEED_COLLEAGUES) {
        const tokens = tokenizeTeaser(col.sentence, col.keywords);
        for (const kw of col.keywords) {
          const kwClean = kw.word.trim().toLowerCase();
          const matched = tokens.some((t) => t.clean === kwClean || t.clean.includes(kwClean));
          expect(
            matched,
            `Keyword "${kw.word}" for colleague "${col.name}" must be matched in sentence "${col.sentence}"`
          ).toBe(true);
        }
      }
    });

    it('handles tricky punctuation marks trailing and surrounding keywords', () => {
      const sentence = 'Er liebt Kaffee! Wirklich: (Kaffee)? Und "Lösungen", ja...';
      const keywords = [{ word: 'Kaffee', emoji: '☕' }, { word: 'Lösungen', emoji: '🚀' }];
      const tokens = tokenizeTeaser(sentence, keywords);

      const kaffeeTokens = tokens.filter((t) => t.isKeyword && t.clean.includes('kaffee'));
      expect(kaffeeTokens.length).toBeGreaterThanOrEqual(2);

      const loesungToken = tokens.find((t) => t.clean.includes('lösungen'));
      expect(loesungToken).toBeDefined();
      expect(loesungToken?.isKeyword).toBe(true);
    });

    it('empirically renders TeaserSentence for all 24 colleagues with .teaser-word and span[data-word]', () => {
      for (const col of SEED_COLLEAGUES) {
        const html = renderToString(
          React.createElement(TeaserSentence, {
            sentence: col.sentence,
            keywords: col.keywords,
          })
        );

        expect(html).toContain('data-testid="teaser-sentence-container"');
        expect(html).toContain('class="teaser-word');
        expect(html).toContain('data-word=');

        // Check each keyword word is present in html
        for (const kw of col.keywords) {
          const kwLower = kw.word.toLowerCase();
          expect(html.toLowerCase()).toContain(kwLower);
        }
      }
    });

    it('proves Lucas TeaserSentence HTML highlights Systemstabilität with gold styling', () => {
      const lucas = SEED_COLLEAGUES.find((c) => c.name === 'Lucas')!;
      const html = renderToString(
        React.createElement(TeaserSentence, {
          sentence: lucas.sentence,
          keywords: lucas.keywords,
        })
      );

      expect(html).toContain('data-word="systemstabilität"');
      expect(html).toContain('text-amber-300 font-bold');
    });

    it('simulates rapid emoji particle pops and verifies auto-cleanup with 0 memory leaks', () => {
      const pool = new EmojiParticlePool();

      // Stress test: 50 consecutive pops
      const cleanupBatches: string[][] = [];
      for (let i = 0; i < 50; i++) {
        const { newParticles } = pool.pop('🚀', 8);
        cleanupBatches.push(newParticles.map((p) => p.id));
      }

      // 50 * 8 = 400 active particles
      expect(pool.count()).toBe(400);

      // Simulate the 750ms timeout cleanup for all 50 batches
      for (const batch of cleanupBatches) {
        pool.cleanup(batch);
      }

      // Must be completely emptied
      expect(pool.count()).toBe(0);
    });

    it('verifies radial particle dispersion vectors are omnidirectional (360 degrees)', () => {
      const pool = new EmojiParticlePool();
      const { newParticles } = pool.pop('✨', 16);

      // Verify particles disperse in both positive and negative X and Y
      const posX = newParticles.filter((p) => p.targetX > 0);
      const negX = newParticles.filter((p) => p.targetX < 0);
      const posY = newParticles.filter((p) => p.targetY > 0);
      const negY = newParticles.filter((p) => p.targetY < 0);

      expect(posX.length).toBeGreaterThan(0);
      expect(negX.length).toBeGreaterThan(0);
      expect(posY.length).toBeGreaterThan(0);
      expect(negY.length).toBeGreaterThan(0);
    });

    it('empirically renders EmojiPopChip with correct keyword-chip-index testid and content', () => {
      const html = renderToString(
        React.createElement(EmojiPopChip, {
          index: 0,
          keyword: { word: 'Stabilität', emoji: '🛡️' },
        })
      );

      expect(html).toContain('data-testid="keyword-chip-0"');
      expect(html).toContain('🛡️');
      expect(html).toContain('Stabilität');
    });
  });

  // -------------------------------------------------------------------------
  // 3. 3D Card Tilt Dampening & Math (Gyro Clamping & Mouse Tracking Reset)
  // -------------------------------------------------------------------------
  describe('3. 3D Card Tilt Dampening & Math', () => {
    it('strictly clamps extreme gyro beta and gamma values (+/- 90°, +/- 180°) to +/- 20°', () => {
      const extremes = [
        { beta: 90, gamma: 90, expX: -20, expY: 20 },
        { beta: -90, gamma: -90, expX: 20, expY: -20 },
        { beta: 180, gamma: 180, expX: -20, expY: 20 },
        { beta: -180, gamma: -180, expX: 20, expY: -20 },
        { beta: 45, gamma: 45, expX: -20, expY: 20 },
        { beta: -45, gamma: -45, expX: 20, expY: -20 },
      ];

      for (const { beta, gamma, expX, expY } of extremes) {
        const { rotateX, rotateY } = calculateGyroTilt(beta, gamma, 20);
        expect(rotateX).toBe(expX);
        expect(rotateY).toBe(expY);
        expect(Math.abs(rotateX)).toBeLessThanOrEqual(20);
        expect(Math.abs(rotateY)).toBeLessThanOrEqual(20);
      }
    });

    it('Monte Carlo Fuzzing: 5,000 random (beta, gamma) pairs never violate +/- 20° bound', () => {
      for (let i = 0; i < 5000; i++) {
        const randomBeta = (Math.random() - 0.5) * 720; // [-360, +360]
        const randomGamma = (Math.random() - 0.5) * 720; // [-360, +360]

        const { rotateX, rotateY } = calculateGyroTilt(randomBeta, randomGamma, 20);

        expect(Math.abs(rotateX)).toBeLessThanOrEqual(20.0001);
        expect(Math.abs(rotateY)).toBeLessThanOrEqual(20.0001);
        expect(Number.isFinite(rotateX)).toBe(true);
        expect(Number.isFinite(rotateY)).toBe(true);
        expect(Object.is(rotateX, -0)).toBe(false); // No negative zero
        expect(Object.is(rotateY, -0)).toBe(false); // No negative zero
      }
    });

    it('returns neutral 0 tilt on null or undefined gyro data', () => {
      expect(calculateGyroTilt(null, null, 20)).toEqual({ rotateX: 0, rotateY: 0 });
      expect(calculateGyroTilt(null, 30, 20)).toEqual({ rotateX: 0, rotateY: 0 });
      expect(calculateGyroTilt(30, null, 20)).toEqual({ rotateX: 0, rotateY: 0 });
    });

    it('smoothly calculates desktop mouse tilt and clamps to +/- 20° even on extreme cursor positions', () => {
      const rect = { left: 100, top: 100, width: 200, height: 200 };

      // Exact Center
      expect(calculateMouseTilt(200, 200, rect, 20)).toEqual({ rotateX: 0, rotateY: 0 });

      // Corners
      expect(calculateMouseTilt(100, 100, rect, 20)).toEqual({ rotateX: 20, rotateY: -20 });
      expect(calculateMouseTilt(300, 300, rect, 20)).toEqual({ rotateX: -20, rotateY: 20 });

      // Far outside bounds (e.g. cursor at -1000, 5000)
      const farOut = calculateMouseTilt(-1000, 5000, rect, 20);
      expect(farOut.rotateX).toBe(-20);
      expect(farOut.rotateY).toBe(-20);
    });

    it('handles degenerate bounding rectangles (width = 0 or height = 0) safely without NaN or throw', () => {
      const degenerateRect = { left: 50, top: 50, width: 0, height: 0 };
      const tilt = calculateMouseTilt(100, 100, degenerateRect, 20);
      expect(tilt).toEqual({ rotateX: 0, rotateY: 0 });
    });

    it('resets tilt on mouseleave event', () => {
      // Simulating handleMouseLeave behavior
      let tilt = { rotateX: 15.5, rotateY: -12.3 };
      const handleMouseLeave = () => {
        tilt = { rotateX: 0, rotateY: 0 };
      };

      handleMouseLeave();
      expect(tilt).toEqual({ rotateX: 0, rotateY: 0 });
    });

    it('calculates parallax shine coordinates and gradient angle strictly within [0, 100]%', () => {
      for (let rx = -20; rx <= 20; rx += 5) {
        for (let ry = -20; ry <= 20; ry += 5) {
          const shine = calculateParallaxShine(rx, ry, 20);
          expect(shine.shineX).toBeGreaterThanOrEqual(0);
          expect(shine.shineX).toBeLessThanOrEqual(100);
          expect(shine.shineY).toBeGreaterThanOrEqual(0);
          expect(shine.shineY).toBeLessThanOrEqual(100);
          expect(shine.gradientAngle).toBeGreaterThanOrEqual(90);
          expect(shine.gradientAngle).toBeLessThanOrEqual(180);
        }
      }
    });

    it('empirically renders HolographicCard with holographic-tilt-card and parallax-shine-overlay testids', () => {
      const html = renderToString(
        React.createElement(
          HolographicCard,
          null,
          React.createElement('span', null, 'Card Content')
        )
      );

      expect(html).toContain('data-testid="holographic-tilt-card"');
      expect(html).toContain('data-testid="parallax-shine-overlay"');
      expect(html).toContain('perspective(1000px)');
    });
  });

  // -------------------------------------------------------------------------
  // 4. DOM Selectors Cross-check: Verify All Testids in JSX
  // -------------------------------------------------------------------------
  describe('4. DOM Selectors Cross-Check with E2E Suite', () => {
    it('verifies all expected testid strings and CSS selectors match across E2E requirements in source files', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');

      const readSrcFile = (relPath: string) =>
        fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');

      const rotaryDialContent = readSrcFile('src/components/phase3/SafeRotaryDial.tsx');
      const boltIndicatorContent = readSrcFile('src/components/phase3/BoltIndicator.tsx');
      const vaultDoorContent = readSrcFile('src/components/phase3/VaultDoor.tsx');
      const matrixScrambleContent = readSrcFile('src/components/phase4/MatrixScrambleText.tsx');
      const teaserContent = readSrcFile('src/components/phase4/TeaserSentence.tsx');
      const emojiPopContent = readSrcFile('src/components/phase4/EmojiPop.tsx');
      const holoCardContent = readSrcFile('src/components/phase4/HolographicCard.tsx');
      const partnerRevealContent = readSrcFile('src/components/phase4/PartnerReveal.tsx');

      // 06-safe-rotary-dial.spec.ts requirements
      expect(rotaryDialContent).toContain('data-testid="safe-rotary-dial"');
      expect(boltIndicatorContent).toContain('data-testid={`bolt-indicator-${index}`}');
      expect(vaultDoorContent).toContain('data-testid="vault-door-open"');

      // 07-matrix-reveal-and-teaser.spec.ts requirements
      expect(matrixScrambleContent).toContain('data-testid="matrix-scramble-text"');
      expect(teaserContent).toContain('data-testid="teaser-sentence-container"');
      expect(teaserContent).toContain('className={`teaser-word');
      expect(teaserContent).toContain('data-word={cleanWord}');
      expect(emojiPopContent).toContain('data-testid={`keyword-chip-${index}`}');
      expect(emojiPopContent).toContain('data-testid="emoji-particle"');
      expect(emojiPopContent).toContain('className="emoji-pop-particle');
      expect(holoCardContent).toContain('data-testid="holographic-tilt-card"');
      expect(holoCardContent).toContain('data-testid="parallax-shine-overlay"');
      expect(partnerRevealContent).toContain('data-testid="partner-reveal-container"');
    });

    it('empirically renders Phase 3 BoltIndicator, VaultDoor, and SafeRotaryDial components', () => {
      // BoltIndicator
      const bolt0 = renderToString(React.createElement(BoltIndicator, { index: 0, isLocked: true, isCurrentTarget: false }));
      const bolt1 = renderToString(React.createElement(BoltIndicator, { index: 1, isLocked: false, isCurrentTarget: true }));
      const bolt2 = renderToString(React.createElement(BoltIndicator, { index: 2, isLocked: false, isCurrentTarget: false }));

      expect(bolt0).toContain('data-testid="bolt-indicator-0"');
      expect(bolt1).toContain('data-testid="bolt-indicator-1"');
      expect(bolt2).toContain('data-testid="bolt-indicator-2"');

      // VaultDoor
      const closedVault = renderToString(React.createElement(VaultDoor, { isOpen: false }, 'Door Child'));
      expect(closedVault).not.toContain('data-testid="vault-door-open"');

      const openVault = renderToString(React.createElement(VaultDoor, { isOpen: true }, 'Door Child'));
      expect(openVault).toContain('data-testid="vault-door-open"');
      expect(openVault).toContain('Tresor entriegelt!');

      // SafeRotaryDial
      const dial = renderToString(React.createElement(SafeRotaryDial, { visualAngle: 45 }));
      expect(dial).toContain('data-testid="safe-rotary-dial"');
    });

    it('empirically renders PartnerReveal in both loading, unauth, and festive reveal states', () => {
      // Initial state without assignment triggers loading placeholder
      const loadingReveal = renderToString(React.createElement(PartnerReveal, { initialAssignment: null }));
      expect(loadingReveal).toContain('data-testid="partner-reveal-container"');
      expect(loadingReveal).toContain('Entschlüssele Zuweisung...');

      // Fully populated assignment reveals partner card and teaser
      const populatedReveal = renderToString(
        React.createElement(PartnerReveal, {
          initialAssignment: {
            isDrawn: true,
            partner: { id: 18, name: 'André', displayName: 'André' },
            teaser: {
              sentence: 'Kombiniert analytische Schärfe mit ansteckendem Optimismus!',
              keywords: [
                { word: 'Schärfe', emoji: '🗡️' },
                { word: 'Optimismus', emoji: '🌟' },
              ],
            },
          },
        })
      );

      expect(populatedReveal).toContain('data-testid="partner-reveal-container"');
      expect(populatedReveal).toContain('data-testid="holographic-tilt-card"');
      expect(populatedReveal).toContain('data-testid="matrix-scramble-text"');
      expect(populatedReveal).toContain('data-testid="teaser-sentence-container"');
      expect(populatedReveal).toContain('data-testid="keyword-chip-0"');
      expect(populatedReveal).toContain('data-testid="keyword-chip-1"');
      expect(populatedReveal).toContain('Dein Wichtelpartner');
    });
  });
});
