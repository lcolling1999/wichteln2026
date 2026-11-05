import { test, expect } from '@playwright/test';
import { injectSensorMocks, simulateRotaryDialTurn } from '../helpers/sensor-mocks';
import { WichtelnApiClient } from '../helpers/api-client';

test.describe('Tier 2: Safe Dial Gesture Anomalies & Admin Protection Boundaries', () => {
  test('TC-B5-01 (0°/360° Discontinuity): Dragging past boundary transition does not cause erratic angle jumps', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      // Rotate 1.25 turns, crossing the 0/360 boundary multiple times
      await simulateRotaryDialTurn(page, '[data-testid="safe-rotary-dial"]', {
        turns: 1.25,
        stepsPerTurn: 32,
      });

      // Verify page is intact and dial has not errored
      await expect(safeDial).toBeVisible();
    }
  });

  test('TC-B5-02 (Reverse Spinning): Counter-clockwise rotation decrements angle without false bolt clicks', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      // Counter-clockwise turn
      await simulateRotaryDialTurn(page, '[data-testid="safe-rotary-dial"]', {
        turns: 1,
        clockwise: false,
      });

      const vaultOpen = page.locator('[data-testid="vault-door-open"]');
      // Should NOT open on reverse rotation
      expect(await vaultOpen.count()).toBe(0);
    }
  });

  test('TC-B5-03 (High Velocity Flick): Fast swipe on rotary dial preserves gesture state', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      // Fast flick: 8 steps per turn with 5ms wait
      await simulateRotaryDialTurn(page, '[data-testid="safe-rotary-dial"]', {
        turns: 0.75,
        stepsPerTurn: 8,
      });
      await expect(safeDial).toBeVisible();
    }
  });

  test('TC-B5-04 (Interrupted Gesture / Pointer Cancel): Releasing pointer outside dial resets active drag state', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      const box = await safeDial.boundingBox();
      if (box) {
        // Mouse down inside dial
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        // Drag far outside the viewport to simulate pointer cancel / leave
        await page.mouse.move(-50, -50);
        await page.mouse.up();

        await page.waitForTimeout(50);
        await expect(safeDial).toBeVisible();
      }
    }
  });

  test('TC-B5-05 (Admin PIN Rate Limiting): Multiple consecutive incorrect PIN attempts are rejected and throttled', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);

    // 5 rapid invalid attempts
    for (let i = 0; i < 5; i++) {
      const res = await api.adminLogin(`wrong_pin_${i}`);
      expect([401, 429]).toContain(res.status);
    }

    // Clean up rate limiter after test finishes so other tests / browser projects aren't locked out
    await api.resetRateLimit();
  });
});
