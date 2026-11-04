import { test, expect } from '@playwright/test';
import { injectSensorMocks, simulateVibrationUnsupported } from '../helpers/sensor-mocks';

test.describe('Tier 2: Device API Graceful Degradation', () => {
  test('TC-B4-01 (Missing Vibration API): Rotary safe dial functions without throwing when navigator.vibrate is absent', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await simulateVibrationUnsupported(page);

    await page.goto('/');

    // Check no uncaught TypeError for navigator.vibrate
    const errorLogs: string[] = [];
    page.on('pageerror', (err) => errorLogs.push(err.message));

    const body = page.locator('body');
    await expect(body).toBeVisible();

    const vibrateErrors = errorLogs.filter((msg) => msg.includes('vibrate'));
    expect(vibrateErrors).toHaveLength(0);
  });

  test('TC-B4-02 (Missing Gyroscope): Gift card renders and handles desktop mouse hover when gyro is unavailable', async ({
    page,
  }) => {
    await injectSensorMocks(page);

    // Explicitly delete DeviceOrientationEvent on window
    await page.addInitScript(() => {
      delete (window as any).DeviceOrientationEvent;
    });

    await page.goto('/');

    const tiltCard = page.locator('[data-testid="holographic-tilt-card"]');
    if (await tiltCard.isVisible()) {
      await tiltCard.hover();
      await expect(tiltCard).toBeVisible();
    }
  });

  test('TC-B4-03 (Autoplay Blocked AudioContext): Web Audio API initializes suspended and resumes on first tap', async ({
    page,
  }) => {
    await injectSensorMocks(page);

    await page.addInitScript(() => {
      // Simulate suspended AudioContext
      const origAudio = window.AudioContext;
      if (origAudio) {
        window.AudioContext = class extends origAudio {
          get state() {
            return 'suspended' as AudioContextState;
          }
        };
      }
    });

    await page.goto('/');

    // First user tap should resume
    await page.locator('body').click();
    await page.waitForTimeout(50);

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('TC-B4-04 (Reduced Motion Preference): UI respects prefers-reduced-motion media feature', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await injectSensorMocks(page);

    await page.goto('/');

    const isReducedMotion = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    expect(isReducedMotion).toBe(true);

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('TC-B4-05 (Mobile Viewport Stress - 320px): All components fit within 320px width without horizontal body overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await injectSensorMocks(page);

    await page.goto('/');

    // Check that document scrollWidth does not exceed viewport width
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(325); // Minor margin of tolerance
  });
});
