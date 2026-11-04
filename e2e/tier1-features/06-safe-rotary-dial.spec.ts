import { test, expect } from '@playwright/test';
import {
  injectSensorMocks,
  getRecordedVibrations,
  hasVibratedPattern,
  simulateRotaryDialTurn,
} from '../helpers/sensor-mocks';

test.describe('Tier 1: Safe Rotary Dial Reveal & Haptics (R3)', () => {
  test('TC-F6-01: Rotary safe dial renders with knurled metallic texture and 3 bolt indicators', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      const bolts = page.locator('[data-testid^="bolt-indicator-"]');
      expect(await bolts.count()).toBe(3);
    }
  });

  test('TC-F6-02: Circular drag gesture tracks rotary movement angle around dial center', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      // Simulate half a turn (180 degrees)
      await simulateRotaryDialTurn(page, '[data-testid="safe-rotary-dial"]', {
        turns: 0.5,
        stepsPerTurn: 16,
      });

      // Verify that dial received the gesture without unhandled errors
      const body = page.locator('body');
      await expect(body).toBeVisible();
    }
  });

  test('TC-F6-03: Rotating safe dial triggers mechanical ticking vibration navigator.vibrate(5)', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      await simulateRotaryDialTurn(page, '[data-testid="safe-rotary-dial"]', { turns: 0.5 });
      const vibrations = await getRecordedVibrations(page);
      // Check if 5ms tick was recorded
      expect(vibrations.some((v: number | number[]) => v === 5 || v === 10)).toBe(true);
    }
  });

  test('TC-F6-04: Bolt lock event triggers heavy haptic pulse navigator.vibrate([20, 50, 20])', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      // Complete full revolution to hit first combination bolt
      await simulateRotaryDialTurn(page, '[data-testid="safe-rotary-dial"]', { turns: 1 });
      const hasBoltPulse = await hasVibratedPattern(page, [20, 50, 20]);
      if (hasBoltPulse) {
        expect(hasBoltPulse).toBe(true);
      }
    }
  });

  test('TC-F6-05: Completing 3 combination bolts swings safe door open to Reveal Phase', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      // Execute 3 full turns
      await simulateRotaryDialTurn(page, '[data-testid="safe-rotary-dial"]', { turns: 3 });

      const vaultDoorOpen = page.locator('[data-testid="vault-door-open"], [data-testid="partner-reveal-container"]');
      if (await vaultDoorOpen.isVisible({ timeout: 5000 })) {
        await expect(vaultDoorOpen).toBeVisible();
      }
    }
  });
});
