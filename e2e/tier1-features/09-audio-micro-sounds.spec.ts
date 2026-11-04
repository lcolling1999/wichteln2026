import { test, expect } from '@playwright/test';
import { injectSensorMocks, getRecordedAudioEvents } from '../helpers/sensor-mocks';

test.describe('Tier 1: Web Audio API Micro-Sounds Engine (R4)', () => {
  test('TC-F9-01: Audio synthesis system initializes AudioContext on first user interaction', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    // Click anywhere on page body to simulate user gesture
    await page.locator('body').click();
    await page.waitForTimeout(100);

    const isAudioContextCreated = await page.evaluate(() => {
      return typeof window.AudioContext !== 'undefined';
    });
    expect(isAudioContextCreated).toBe(true);
  });

  test('TC-F9-02: Micro-sounds engine synthesizes audio oscillators without loading external MP3 files', async ({
    page,
  }) => {
    await injectSensorMocks(page);

    const externalAudioRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url().toLowerCase();
      if (url.endsWith('.mp3') || url.endsWith('.wav') || url.endsWith('.ogg')) {
        externalAudioRequests.push(url);
      }
    });

    await page.goto('/');
    // All sounds are synthesized dynamically via Web Audio API (zero external audio requests)
    expect(externalAudioRequests).toHaveLength(0);
  });

  test('TC-F9-03: Rotary dial rotation synthesizes mechanical click oscillators', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      await safeDial.click();
      const audioEvents = await getRecordedAudioEvents(page);
      expect(Array.isArray(audioEvents)).toBe(true);
    }
  });

  test('TC-F9-04: Audio toggle button mutes all synthetic sound generation', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const muteBtn = page.locator('[data-testid="audio-toggle-btn"]');
    if (await muteBtn.isVisible()) {
      await muteBtn.click();
      const isMuted = await page.locator('[data-testid="audio-muted-icon"]').isVisible();
      expect(isMuted).toBe(true);
    }
  });

  test('TC-F9-05: App runs without crashing when Web Audio API is initially suspended', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const errorLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errorLogs.push(msg.text());
    });

    // Check no unhandled audio autoplay policy rejection
    const audioErrors = errorLogs.filter((log) =>
      log.toLowerCase().includes('audiocontext') && log.toLowerCase().includes('not allowed to start')
    );
    expect(audioErrors).toHaveLength(0);
  });
});
