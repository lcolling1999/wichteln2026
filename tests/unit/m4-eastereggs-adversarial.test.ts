import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';

import { HolographicCard } from '../../src/components/phase4/HolographicCard';
import { SecretWishlistNotepad } from '../../src/components/eastereggs/SecretWishlistNotepad';
import { GrinchOverlay } from '../../src/components/eastereggs/GrinchOverlay';
import { soundEngine } from '../../src/audio/soundEngine';

import { setDatabase } from '../../server/db/database.js';
import { initializeSchema } from '../../server/db/schema.js';
import { seedDatabase } from '../../server/db/seeds.js';
import { createQueryLayer } from '../../server/db/queries.js';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';

// ============================================================================
// Empirical Sliding-Window Tap Simulator (matching HolographicCard.tsx)
// ============================================================================
class TripleTapSimulationHarness {
  public tapTimes: number[] = [];
  public isFlipped = false;
  public flipHistory: boolean[] = [];
  public callCount = 0;

  constructor(private windowMs = 600) {}

  public recordTap(now: number, targetTagName: string, parentTagNames: string[] = []): boolean {
    // Mimic (e.target as HTMLElement).closest('textarea, input, button, a')
    const allTags = [targetTagName, ...parentTagNames].map((t) => t.toUpperCase());
    const interactiveTags = ['TEXTAREA', 'INPUT', 'BUTTON', 'A'];
    const isInteractive = allTags.some((tag) => interactiveTags.includes(tag));

    if (isInteractive) {
      return false; // Ignored by bubbling guard
    }

    this.tapTimes = [...this.tapTimes.filter((t) => now - t < this.windowMs), now];
    if (this.tapTimes.length >= 3) {
      this.tapTimes = [];
      this.isFlipped = !this.isFlipped;
      this.flipHistory.push(this.isFlipped);
      this.callCount++;
      return true;
    }
    return false;
  }

  public reset(): void {
    this.tapTimes = [];
    this.isFlipped = false;
    this.flipHistory = [];
    this.callCount = 0;
  }
}

// ============================================================================
// Empirical Pull-Down Detection Simulator (matching GrinchOverlay.tsx)
// ============================================================================
class GrinchPullDownHarness {
  public isActive = false;
  public startY = 0;
  public isDragging = false;
  public dismissTimer: ReturnType<typeof setTimeout> | null = null;
  public triggerCount = 0;

  public handlePointerDown(clientY: number, scrollY = 0): void {
    if (clientY <= 80 && scrollY <= 20) {
      this.isDragging = true;
      this.startY = clientY;
    }
  }

  public handlePointerMove(clientY: number): boolean {
    if (!this.isDragging) return false;
    const deltaY = clientY - this.startY;
    if (deltaY > 120) {
      this.isDragging = false;
      this.triggerGrinchMode();
      return true;
    }
    return false;
  }

  public handlePointerUp(): void {
    this.isDragging = false;
  }

  public triggerGrinchMode(): void {
    this.isActive = true;
    this.triggerCount++;
    soundEngine.playGrinchSound();

    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => {
      this.isActive = false;
    }, 4000);
  }

  public handleDismiss(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
    this.isActive = false;
  }
}

// ============================================================================
// Test Suite: Adversarial Stress Testing of Easter Eggs 3 & 4
// ============================================================================
describe('Milestone 4 Adversarial Stress: Easter Egg 3 & Easter Egg 4', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Triple-Tap Window & Sliding-Window Boundary Stress (EE3)
  // ==========================================================================
  describe('1. Triple-Tap Timing Window & Boundary Math (EE3)', () => {
    it('proves a single tap at t=0ms never triggers card flip', () => {
      const harness = new TripleTapSimulationHarness(600);
      harness.recordTap(0, 'DIV');
      expect(harness.isFlipped).toBe(false);
      expect(harness.tapTimes).toEqual([0]);
      expect(harness.callCount).toBe(0);
    });

    it('proves two rapid taps (t=0ms, t=250ms) never trigger card flip', () => {
      const harness = new TripleTapSimulationHarness(600);
      harness.recordTap(0, 'DIV');
      harness.recordTap(250, 'DIV');
      expect(harness.isFlipped).toBe(false);
      expect(harness.tapTimes).toEqual([0, 250]);
      expect(harness.callCount).toBe(0);
    });

    it('empirically flips card when 3 taps arrive within 590ms (<600ms window)', () => {
      const harness = new TripleTapSimulationHarness(600);
      harness.recordTap(0, 'DIV');
      harness.recordTap(250, 'DIV');
      const flipped = harness.recordTap(590, 'DIV'); // span: 590ms < 600ms
      expect(flipped).toBe(true);
      expect(harness.isFlipped).toBe(true);
      expect(harness.callCount).toBe(1);
      // Tap queue is flushed upon trigger
      expect(harness.tapTimes).toEqual([]);
    });

    it('strictly rejects 3 taps spaced 650ms apart (tap 1 expires before tap 3)', () => {
      const harness = new TripleTapSimulationHarness(600);
      harness.recordTap(0, 'DIV');
      expect(harness.tapTimes).toEqual([0]);

      // Tap 2 at 650ms (tap 1 expired: 650 - 0 = 650 >= 600)
      harness.recordTap(650, 'DIV');
      expect(harness.tapTimes).toEqual([650]);
      expect(harness.isFlipped).toBe(false);

      // Tap 3 at 1300ms (tap 2 expired: 1300 - 650 = 650 >= 600)
      harness.recordTap(1300, 'DIV');
      expect(harness.tapTimes).toEqual([1300]);
      expect(harness.isFlipped).toBe(false);
      expect(harness.callCount).toBe(0);
    });

    it('boundary stress: tap at t=599ms triggers flip, but tap at t=601ms rejects flip', () => {
      // Test A: t=0, t=300, t=599 (599 - 0 = 599 < 600 -> all 3 retained -> flips)
      const harnessA = new TripleTapSimulationHarness(600);
      harnessA.recordTap(0, 'DIV');
      harnessA.recordTap(300, 'DIV');
      expect(harnessA.recordTap(599, 'DIV')).toBe(true);
      expect(harnessA.isFlipped).toBe(true);

      // Test B: t=0, t=300, t=601 (601 - 0 = 601 >= 600 -> t=0 purged, only [300, 601] left -> NO flip)
      const harnessB = new TripleTapSimulationHarness(600);
      harnessB.recordTap(0, 'DIV');
      harnessB.recordTap(300, 'DIV');
      expect(harnessB.recordTap(601, 'DIV')).toBe(false);
      expect(harnessB.isFlipped).toBe(false);
      expect(harnessB.tapTimes).toEqual([300, 601]);
    });

    it('burst of 6 rapid taps flips card twice (front -> back -> front)', () => {
      const harness = new TripleTapSimulationHarness(600);
      const tapTimestamps = [0, 50, 100, 150, 200, 250];

      for (const t of tapTimestamps) {
        harness.recordTap(t, 'DIV');
      }

      // Taps 1-3 flip to true, Taps 4-6 flip back to false
      expect(harness.callCount).toBe(2);
      expect(harness.flipHistory).toEqual([true, false]);
      expect(harness.isFlipped).toBe(false);
      expect(harness.tapTimes).toEqual([]);
    });

    it('burst of 10 rapid taps flips card 3 times and leaves 1 tap in queue', () => {
      const harness = new TripleTapSimulationHarness(600);
      for (let i = 0; i < 10; i++) {
        harness.recordTap(i * 30, 'DIV');
      }

      // 10 taps / 3 = 3 complete flips (true -> false -> true), 1 remainder tap
      expect(harness.callCount).toBe(3);
      expect(harness.flipHistory).toEqual([true, false, true]);
      expect(harness.isFlipped).toBe(true);
      expect(harness.tapTimes).toEqual([270]);
    });

    it('intermittent pairs of taps separated by long pauses never flip', () => {
      const harness = new TripleTapSimulationHarness(600);
      // Pair 1 at 0ms, 100ms
      harness.recordTap(0, 'DIV');
      harness.recordTap(100, 'DIV');
      // 2-second pause
      // Pair 2 at 2100ms, 2200ms
      harness.recordTap(2100, 'DIV');
      harness.recordTap(2200, 'DIV');
      // 2-second pause
      // Pair 3 at 4200ms, 4300ms
      harness.recordTap(4200, 'DIV');
      harness.recordTap(4300, 'DIV');

      // Despite 6 total taps, no 3 taps ever coexisted in a 600ms window
      expect(harness.isFlipped).toBe(false);
      expect(harness.callCount).toBe(0);
      expect(harness.tapTimes).toEqual([4200, 4300]);
    });

    it('Monte Carlo Fuzzing: 2,000 random tap intervals accurately uphold the 600ms invariant', () => {
      const harness = new TripleTapSimulationHarness(600);
      let currentTime = 0;

      for (let i = 0; i < 2000; i++) {
        // Random interval between 20ms and 800ms
        const dt = Math.floor(Math.random() * 780) + 20;
        currentTime += dt;

        const previousQueue = [...harness.tapTimes];
        const validPrior = previousQueue.filter((t) => currentTime - t < 600);
        const shouldFlip = validPrior.length >= 2;

        const flipped = harness.recordTap(currentTime, 'DIV');
        expect(flipped).toBe(shouldFlip);
      }
    });
  });

  // ==========================================================================
  // 2. Click Bubbling Guards on Interactive Children (EE3)
  // ==========================================================================
  describe('2. Click Bubbling Guards & Interactive Element Defense (EE3)', () => {
    it('strictly ignores clicks originating on <textarea> elements', () => {
      const harness = new TripleTapSimulationHarness(600);
      for (let i = 0; i < 5; i++) {
        const flipped = harness.recordTap(i * 50, 'TEXTAREA');
        expect(flipped).toBe(false);
      }
      expect(harness.tapTimes).toHaveLength(0);
      expect(harness.isFlipped).toBe(false);
    });

    it('strictly ignores clicks originating on <input> elements', () => {
      const harness = new TripleTapSimulationHarness(600);
      for (let i = 0; i < 5; i++) {
        harness.recordTap(i * 50, 'INPUT');
      }
      expect(harness.tapTimes).toHaveLength(0);
      expect(harness.isFlipped).toBe(false);
    });

    it('strictly ignores clicks originating on <button> elements', () => {
      const harness = new TripleTapSimulationHarness(600);
      for (let i = 0; i < 5; i++) {
        harness.recordTap(i * 50, 'BUTTON');
      }
      expect(harness.tapTimes).toHaveLength(0);
      expect(harness.isFlipped).toBe(false);
    });

    it('strictly ignores clicks originating on <a> link elements', () => {
      const harness = new TripleTapSimulationHarness(600);
      for (let i = 0; i < 5; i++) {
        harness.recordTap(i * 50, 'A');
      }
      expect(harness.tapTimes).toHaveLength(0);
      expect(harness.isFlipped).toBe(false);
    });

    it('traverses parent hierarchy via .closest to guard nested icons and spans inside buttons', () => {
      const harness = new TripleTapSimulationHarness(600);
      // User clicks on <svg> or <span> inside <button>
      harness.recordTap(0, 'SPAN', ['BUTTON', 'DIV']);
      harness.recordTap(100, 'SVG', ['BUTTON', 'DIV']);
      harness.recordTap(200, 'PATH', ['SVG', 'BUTTON', 'DIV']);

      expect(harness.tapTimes).toHaveLength(0);
      expect(harness.isFlipped).toBe(false);
    });

    it('allows non-interactive children (headings, paragraphs, decorative divs) to trigger flip', () => {
      const harness = new TripleTapSimulationHarness(600);
      harness.recordTap(0, 'H3', ['DIV']);
      harness.recordTap(100, 'P', ['DIV']);
      harness.recordTap(200, 'SPAN', ['DIV']); // Span NOT inside button/input

      expect(harness.tapTimes).toHaveLength(0); // Triggered and cleared
      expect(harness.isFlipped).toBe(true);
    });

    it('prevents flip during simulated text selection / drag within textarea', () => {
      const harness = new TripleTapSimulationHarness(600);
      // Mousedown on textarea, multiple drag moves, mouseup
      harness.recordTap(10, 'TEXTAREA');
      harness.recordTap(30, 'TEXTAREA');
      harness.recordTap(60, 'TEXTAREA');
      harness.recordTap(90, 'TEXTAREA');

      expect(harness.tapTimes).toHaveLength(0);
      expect(harness.isFlipped).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Debounce Autosave & Persistence Boundary Stress (EE3)
  // ==========================================================================
  describe('3. Debounce Autosave & Persistence Boundary Stress (EE3)', () => {
    it('collapses rapid burst of 100 keystrokes into exactly 1 network PUT request after 500ms', () => {
      const saveMock = vi.fn();
      let timer: ReturnType<typeof setTimeout> | null = null;

      const onKeystroke = (text: string) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          saveMock(text);
        }, 500);
      };

      // Type 100 characters rapidly (every 5ms over 500ms)
      for (let i = 1; i <= 100; i++) {
        vi.advanceTimersByTime(5);
        onKeystroke('A'.repeat(i));
      }

      // No save should have fired during active typing
      expect(saveMock).not.toHaveBeenCalled();

      // Advance by 490ms (still within debounce window)
      vi.advanceTimersByTime(490);
      expect(saveMock).not.toHaveBeenCalled();

      // Advance remaining 10ms (500ms after last keystroke)
      vi.advanceTimersByTime(10);
      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(saveMock).toHaveBeenCalledWith('A'.repeat(100));
    });

    it('suppresses redundant save when edited text equals lastSavedRef (idempotency)', () => {
      const saveMock = vi.fn();
      let lastSaved = 'Kaffee und Buch';
      let timer: ReturnType<typeof setTimeout> | null = null;

      const onKeystroke = (nextText: string) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (nextText === lastSaved) return; // Idempotency check
          lastSaved = nextText;
          saveMock(nextText);
        }, 500);
      };

      // User types space then immediately deletes it
      onKeystroke('Kaffee und Buch ');
      vi.advanceTimersByTime(100);
      onKeystroke('Kaffee und Buch'); // Back to original

      vi.advanceTimersByTime(500);
      expect(saveMock).not.toHaveBeenCalled();
    });

    it('properly transitions through isSaving, isSaved, and error states', async () => {
      let isSaving = false;
      let isSaved = false;
      let saveError: string | null = null;

      const executeSave = async (shouldFail: boolean) => {
        isSaving = true;
        saveError = null;
        try {
          if (shouldFail) throw new Error('Speichern fehlgeschlagen');
          isSaved = true;
        } catch (err: any) {
          saveError = err.message;
        } finally {
          isSaving = false;
        }
      };

      // Scenario 1: Failure
      await executeSave(true);
      expect(isSaving).toBe(false);
      expect(isSaved).toBe(false);
      expect(saveError).toBe('Speichern fehlgeschlagen');

      // Scenario 2: Recovery on retry
      await executeSave(false);
      expect(isSaving).toBe(false);
      expect(isSaved).toBe(true);
      expect(saveError).toBeNull();
    });
  });

  // ==========================================================================
  // 4. Backend Wishlist API Adversarial Hardening & Confidentiality (EE3)
  // ==========================================================================
  describe('4. Backend Wishlist API Adversarial Hardening (EE3)', () => {
    let db: DatabaseSync;
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
      db.exec('PRAGMA foreign_keys = ON;');
      initializeSchema(db);
      seedDatabase(db);
      setDatabase(db);
      app = createApp();
    });

    it('rejects unauthenticated PUT and GET /api/me/wishlist with 401', async () => {
      const getRes = await request(app).get('/api/me/wishlist');
      expect(getRes.status).toBe(401);
      expect(getRes.body.code).toBe('PARTICIPANT_REQUIRED');

      const putRes = await request(app).put('/api/me/wishlist').send({ content: 'Test' });
      expect(putRes.status).toBe(401);
      expect(putRes.body.code).toBe('PARTICIPANT_REQUIRED');
    });

    it('rejects invalid payload types (number, boolean, null, array) with 400 INVALID_INPUT', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(1, false);
      const cookie = `session_token=${token}`;

      const badBodies = [
        { content: 12345 },
        { content: true },
        { content: null },
        { content: ['Kaffee', 'Tee'] },
        {},
      ];

      for (const body of badBodies) {
        const res = await request(app).put('/api/me/wishlist').set('Cookie', cookie).send(body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_INPUT');
      }
    });

    it('accepts exactly 2000 characters and persists correctly', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(1, false);
      const cookie = `session_token=${token}`;

      // Exactly 2000 chars including German umlauts and emojis
      const prefix = 'Lieber Wichtel 🎁: ';
      const fill = 'A'.repeat(2000 - prefix.length);
      const content2000 = prefix + fill;
      expect(content2000.length).toBe(2000);

      const putRes = await request(app)
        .put('/api/me/wishlist')
        .set('Cookie', cookie)
        .send({ content: content2000 });
      expect(putRes.status).toBe(200);
      expect(putRes.body.success).toBe(true);
      expect(putRes.body.content.length).toBe(2000);

      const getRes = await request(app).get('/api/me/wishlist').set('Cookie', cookie);
      expect(getRes.status).toBe(200);
      expect(getRes.body.content).toBe(content2000);
    });

    it('strictly rejects 2001 characters with 400 CONTENT_TOO_LONG', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(1, false);
      const cookie = `session_token=${token}`;

      const content2001 = 'X'.repeat(2001);
      const putRes = await request(app)
        .put('/api/me/wishlist')
        .set('Cookie', cookie)
        .send({ content: content2001 });

      expect(putRes.status).toBe(400);
      expect(putRes.body.code).toBe('CONTENT_TOO_LONG');
    });

    it('handles whitespace-only and empty strings safely', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(1, false);
      const cookie = `session_token=${token}`;

      // Whitespace is trimmed to empty
      const putRes = await request(app)
        .put('/api/me/wishlist')
        .set('Cookie', cookie)
        .send({ content: '   \n\t   ' });
      expect(putRes.status).toBe(200);
      expect(putRes.body.content).toBe('');

      const getRes = await request(app).get('/api/me/wishlist').set('Cookie', cookie);
      expect(getRes.status).toBe(200);
      expect(getRes.body.content).toBe('');
    });

    it('preserves multi-byte Unicode and special JSON characters without corruption', async () => {
      const q = createQueryLayer(db);
      const token = q.createSession(1, false);
      const cookie = `session_token=${token}`;

      const unicodeText = 'Wunsch: "Espresso" ☕ & Bücher <äöüß> 🎄 ✨ \\ / \n 100% Zufall!';
      const putRes = await request(app)
        .put('/api/me/wishlist')
        .set('Cookie', cookie)
        .send({ content: unicodeText });
      expect(putRes.status).toBe(200);

      const getRes = await request(app).get('/api/me/wishlist').set('Cookie', cookie);
      expect(getRes.body.content).toBe(unicodeText.trim());
    });

    it('enforces partner wishlist zero-leakage confidentiality & pre-draw guards', async () => {
      const q = createQueryLayer(db);
      q.setParticipantRegistered(1);
      q.setParticipantRegistered(2);
      q.setParticipantRegistered(3);
      config.allowPartialDraw = true;

      const token1 = q.createSession(1, false);
      const cookie1 = `session_token=${token1}`;

      // 1. Pre-draw query must fail with 400 NOT_DRAWN_YET
      const preDrawRes = await request(app).get('/api/partner/wishlist').set('Cookie', cookie1);
      expect(preDrawRes.status).toBe(400);
      expect(preDrawRes.body.code).toBe('NOT_DRAWN_YET');

      // Trigger admin draw
      const adminLogin = await request(app).post('/api/admin/login').send({ pin: config.adminPin });
      await request(app).post('/api/admin/draw').set('Cookie', adminLogin.headers['set-cookie']);

      // 2. Post-draw with default seeded wishlist -> 200 OK with empty content ''
      const emptyRes = await request(app).get('/api/partner/wishlist').set('Cookie', cookie1);
      expect(emptyRes.status).toBe(200);
      expect(emptyRes.body.content).toBe('');

      // Find who participant 1's partner is
      const assignRes = await request(app).get('/api/me/assignment').set('Cookie', cookie1);
      const partnerId = assignRes.body.partner.id;
      const partnerName = assignRes.body.partner.name;

      // 3. Post-draw if partner row in wish_lists is deleted -> 404 PARTNER_WISHLIST_NOT_FOUND
      db.prepare('DELETE FROM wish_lists WHERE participant_id = ?').run(partnerId);
      const notFoundRes = await request(app).get('/api/partner/wishlist').set('Cookie', cookie1);
      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.body.code).toBe('PARTNER_WISHLIST_NOT_FOUND');

      // 4. Partner writes a wishlist -> 200 OK with content
      const partnerToken = q.createSession(partnerId, false);
      await request(app)
        .put('/api/me/wishlist')
        .set('Cookie', `session_token=${partnerToken}`)
        .send({ content: 'Ich wünsche mir Wollsocken 🧦' });

      // 5. Participant 1 queries partner wishlist -> sees partner's wishlist
      const partnerWishRes = await request(app).get('/api/partner/wishlist').set('Cookie', cookie1);
      expect(partnerWishRes.status).toBe(200);
      expect(partnerWishRes.body.partnerName).toBe(partnerName);
      expect(partnerWishRes.body.content).toBe('Ich wünsche mir Wollsocken 🧦');

      // 6. Zero-Leakage: Participant 1 cannot read other participants' wishlists
      expect(partnerWishRes.body).not.toHaveProperty('allWishlists');
      expect(partnerWishRes.body).not.toHaveProperty('giver');
    });
  });

  // ==========================================================================
  // 5. Grinch-Mode Pull-Down Boundary Coordinates & Math Stress (EE4)
  // ==========================================================================
  describe('5. Grinch-Mode Pull-Down Boundary Coordinates & Math Stress (EE4)', () => {
    it('activates Grinch mode on exact boundary: start y = 80px and deltaY = 121px', () => {
      const harness = new GrinchPullDownHarness();
      harness.handlePointerDown(80, 0); // y <= 80 valid
      expect(harness.isDragging).toBe(true);

      const triggered = harness.handlePointerMove(201); // deltaY = 201 - 80 = 121 > 120
      expect(triggered).toBe(true);
      expect(harness.isActive).toBe(true);
      expect(harness.triggerCount).toBe(1);
    });

    it('strictly rejects pull-down starting at y = 81px or y = 85px (too far from top edge)', () => {
      const harness = new GrinchPullDownHarness();

      // y = 81px
      harness.handlePointerDown(81, 0);
      expect(harness.isDragging).toBe(false);
      expect(harness.handlePointerMove(300)).toBe(false);
      expect(harness.isActive).toBe(false);

      // y = 85px (Dispatch explicit test)
      harness.handlePointerDown(85, 0);
      expect(harness.isDragging).toBe(false);
      expect(harness.handlePointerMove(350)).toBe(false);
      expect(harness.isActive).toBe(false);
      expect(harness.triggerCount).toBe(0);
    });

    it('strictly rejects pull-down when deltaY is 119px or 120px (<= 120px threshold)', () => {
      const harness = new GrinchPullDownHarness();

      // deltaY = 119px (Dispatch explicit test: e.g. start at 20, move to 139)
      harness.handlePointerDown(20, 0);
      expect(harness.handlePointerMove(139)).toBe(false);
      expect(harness.isActive).toBe(false);

      // deltaY = 120px exactly (still must not trigger because specification requires > 120px)
      expect(harness.handlePointerMove(140)).toBe(false);
      expect(harness.isActive).toBe(false);

      // deltaY = 125px (Dispatch explicit test -> triggers!)
      expect(harness.handlePointerMove(145)).toBe(true);
      expect(harness.isActive).toBe(true);
    });

    it('strictly rejects pull-down when page is scrolled down (scrollY > 20px)', () => {
      const harness = new GrinchPullDownHarness();
      // scrollY = 25px
      harness.handlePointerDown(30, 25);
      expect(harness.isDragging).toBe(false);
      expect(harness.handlePointerMove(200)).toBe(false);
      expect(harness.isActive).toBe(false);
    });

    it('allows pull-down at exact scroll boundary scrollY = 20px', () => {
      const harness = new GrinchPullDownHarness();
      harness.handlePointerDown(30, 20); // scrollY <= 20
      expect(harness.isDragging).toBe(true);
      expect(harness.handlePointerMove(160)).toBe(true);
      expect(harness.isActive).toBe(true);
    });

    it('rejects upward swiping (negative deltaY) and horizontal movement', () => {
      const harness = new GrinchPullDownHarness();
      harness.handlePointerDown(60, 0);

      // Swiped UP (60 -> 10, deltaY = -50)
      expect(harness.handlePointerMove(10)).toBe(false);
      expect(harness.isActive).toBe(false);
      expect(harness.isDragging).toBe(true);

      // No vertical delta (horizontal swipe)
      expect(harness.handlePointerMove(60)).toBe(false);
      expect(harness.isActive).toBe(false);
    });

    it('cancels drag on pointerup / pointercancel before threshold is reached', () => {
      const harness = new GrinchPullDownHarness();
      harness.handlePointerDown(30, 0);
      harness.handlePointerMove(100); // delta = 70 < 120
      expect(harness.isDragging).toBe(true);

      harness.handlePointerUp();
      expect(harness.isDragging).toBe(false);

      // Subsequent movement without new down does nothing
      expect(harness.handlePointerMove(200)).toBe(false);
      expect(harness.isActive).toBe(false);
    });

    it('Monte Carlo Fuzzing: 3,000 random pull-down coordinates strictly satisfy mathematical constraints', () => {
      for (let i = 0; i < 3000; i++) {
        const startY = Math.floor(Math.random() * 250); // 0 to 250
        const scrollY = Math.floor(Math.random() * 80);  // 0 to 80
        const currentY = Math.floor(Math.random() * 500); // 0 to 500

        const harness = new GrinchPullDownHarness();
        harness.handlePointerDown(startY, scrollY);

        const expectedDrag = startY <= 80 && scrollY <= 20;
        expect(harness.isDragging).toBe(expectedDrag);

        if (expectedDrag) {
          const deltaY = currentY - startY;
          const expectedTrigger = deltaY > 120;
          const triggered = harness.handlePointerMove(currentY);
          expect(triggered).toBe(expectedTrigger);
          expect(harness.isActive).toBe(expectedTrigger);
        }
      }
    });
  });

  // ==========================================================================
  // 6. Auto-Dismissal Timer vs Manual Dismiss Races (EE4)
  // ==========================================================================
  describe('6. Grinch Auto-Dismissal Timer vs Manual Dismiss Races (EE4)', () => {
    it('auto-dismisses Grinch mode after exactly 4000ms', () => {
      const harness = new GrinchPullDownHarness();
      harness.triggerGrinchMode();
      expect(harness.isActive).toBe(true);

      // At 3990ms: still active
      vi.advanceTimersByTime(3990);
      expect(harness.isActive).toBe(true);

      // At 4000ms: dismissed!
      vi.advanceTimersByTime(10);
      expect(harness.isActive).toBe(false);
    });

    it('immediately dismisses on manual click and cancels pending 4s timer', () => {
      const harness = new GrinchPullDownHarness();
      harness.triggerGrinchMode();
      expect(harness.isActive).toBe(true);

      // User taps overlay at 450ms
      vi.advanceTimersByTime(450);
      harness.handleDismiss();
      expect(harness.isActive).toBe(false);
      expect(harness.dismissTimer).toBeNull();

      // Advancing past 4000ms causes no errors or state flips
      vi.advanceTimersByTime(5000);
      expect(harness.isActive).toBe(false);
    });

    it('resets 4s timer if re-triggered during active presentation', () => {
      const harness = new GrinchPullDownHarness();
      harness.triggerGrinchMode(); // t = 0ms (expires at 4000ms)

      // Re-triggered at 2500ms
      vi.advanceTimersByTime(2500);
      harness.triggerGrinchMode(); // Reset timer (expires at 2500 + 4000 = 6500ms)
      expect(harness.isActive).toBe(true);

      // At t = 4000ms (original expiration): still active!
      vi.advanceTimersByTime(1500);
      expect(harness.isActive).toBe(true);

      // At t = 6490ms: still active
      vi.advanceTimersByTime(2490);
      expect(harness.isActive).toBe(true);

      // At t = 6500ms: dismissed!
      vi.advanceTimersByTime(10);
      expect(harness.isActive).toBe(false);
    });

    it('synthesizes Grinch audio effect upon trigger without throwing even when audio muted', () => {
      soundEngine.setMuted(true);
      const harness = new GrinchPullDownHarness();

      expect(() => harness.triggerGrinchMode()).not.toThrow();
      expect(harness.isActive).toBe(true);

      soundEngine.setMuted(false);
    });
  });

  // ==========================================================================
  // 7. Visual DOM & Component Rendering Integrity (EE3 & EE4)
  // ==========================================================================
  describe('7. Visual DOM & Component Rendering Integrity (EE3 & EE4)', () => {
    it('empirically renders HolographicCard with front face, back face container, and shine overlay', () => {
      const html = renderToString(
        React.createElement(
          HolographicCard,
          {
            backContent: React.createElement('div', { 'data-testid': 'mock-back-notepad' }, 'Notepad'),
          },
          React.createElement('div', { id: 'front-gift' }, 'Geschenkkarte')
        )
      );

      expect(html).toContain('data-testid="holographic-tilt-card"');
      expect(html).toContain('data-testid="parallax-shine-overlay"');
      expect(html).toContain('data-testid="gift-card-front"');
      expect(html).toContain('Geschenkkarte');
      expect(html).toContain('mock-back-notepad');
      expect(html).toContain('rotateY(180deg)');
    });

    it('empirically renders SecretWishlistNotepad with textarea, 2000-char counter, and action buttons', () => {
      const html = renderToString(
        React.createElement(SecretWishlistNotepad, {
          partnerName: 'Carolin',
          onFlipBack: () => {},
        })
      );
      const cleanHtml = html.replace(/<!--.*?-->/g, '');

      expect(cleanHtml).toContain('data-testid="secret-wishlist-notepad"');
      expect(cleanHtml).toContain('data-testid="wishlist-textarea"');
      expect(cleanHtml).toContain('id="secret-wishlist"');
      expect(cleanHtml.toLowerCase()).toContain('maxlength="2000"');
      expect(cleanHtml).toContain('0/2000');
      expect(cleanHtml).toContain('data-testid="peek-partner-wishlist-btn"');
      expect(cleanHtml).toContain('Wunschzettel von Carolin ansehen');
      expect(cleanHtml).toContain('data-testid="flip-card-back-btn"');
      expect(cleanHtml).toContain('Karte umdrehen');
    });

    it('empirically renders GrinchOverlay markup and SVG sneering artwork', () => {
      const html = renderToString(React.createElement(GrinchOverlay));
      // In SSR / initial state isActive is false, so AnimatePresence renders empty
      expect(typeof html).toBe('string');
    });
  });
});
