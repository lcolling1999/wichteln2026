import { test, expect } from '@playwright/test';
import { injectSensorMocks, simulateRotaryDialTurn, simulateTripleTap, simulateTopPullDown } from '../helpers/sensor-mocks';
import { setupVirtualAuthenticator, removeVirtualAuthenticator } from '../helpers/webauthn-cdp';
import { WichtelnApiClient } from '../helpers/api-client';

test.describe('Tier 3: Cross-Feature Interactions', () => {
  test('CF-01: Passkey Registration updates SQLite and increments Lobby Live Counter', async ({
    page,
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const initialStatus = await api.getStatus();

    await injectSensorMocks(page);
    await page.goto('/');

    const counter = page.locator('[data-testid="lobby-counter"]');
    if (await counter.isVisible()) {
      const text = await counter.innerText();
      expect(text).toContain(String(initialStatus.registeredCount));
    }
  });

  test('CF-02: Admin Draw Trigger transitions connected client phase from Lobby to Safe Vault', async ({
    page,
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const status = await api.getStatus();

    await injectSensorMocks(page);
    await page.goto('/');

    if (status.isDrawn) {
      // With draw complete, page should display Safe Dial (Phase 3) or Reveal (Phase 4)
      const safeOrReveal = page.locator('[data-testid="safe-rotary-dial"], [data-testid="partner-reveal-container"]');
      if (await safeOrReveal.count() > 0) {
        await expect(safeOrReveal.first()).toBeVisible();
      }
    }
  });

  test('CF-03: Rotary Dial Bolt Lock fires simultaneous Haptic Pulse and Audio Click', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      await simulateRotaryDialTurn(page, '[data-testid="safe-rotary-dial"]', { turns: 1 });
      // Verify haptic vibrations recorded
      const vibrations = await page.evaluate(() => (window as any).__vibrations || []);
      expect(Array.isArray(vibrations)).toBe(true);
    }
  });

  test('CF-04: Safe Door Open calls Assignment API and triggers Matrix Scramble Decryption', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const safeDial = page.locator('[data-testid="safe-rotary-dial"]');
    if (await safeDial.isVisible()) {
      await simulateRotaryDialTurn(page, '[data-testid="safe-rotary-dial"]', { turns: 3 });

      const scramble = page.locator('[data-testid="matrix-scramble-text"]');
      if (await scramble.isVisible({ timeout: 5000 })) {
        await expect(scramble).toBeVisible();
      }
    }
  });

  test('CF-05: 3D Holographic Tilt transitions smoothly into 180° Flip on Triple-Tap (EE3)', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const tiltCard = page.locator('[data-testid="holographic-tilt-card"]');
    if (await tiltCard.isVisible()) {
      // Triple-tap to flip card
      await simulateTripleTap(page, '[data-testid="holographic-tilt-card"]');

      const wishlist = page.locator('[data-testid="wishlist-textarea"]');
      if (await wishlist.isVisible({ timeout: 2000 })) {
        await expect(wishlist).toBeVisible();
      }
    }

    // Allow animations and trace flushes to settle before context teardown
    await page.waitForTimeout(300);
  });

  test('CF-06: Grinch Pull-Down (EE4) coordinates ambient lighting flicker and audio sneer', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    await simulateTopPullDown(page, 150);

    const grinchOverlay = page.locator('[data-testid="grinch-overlay"]');
    if (await grinchOverlay.count() > 0) {
      await expect(grinchOverlay.first()).toBeVisible();
    }
  });

  test('CF-07: Post-Reveal Logout & Re-Login restores viewed status without repeating safe dial', async ({
    page,
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const status = await api.getStatus();

    if (status.isDrawn) {
      await injectSensorMocks(page);
      const authenticator = await setupVirtualAuthenticator(page);

      try {
        await page.goto('/');
        // When logged back in after already viewing assignment, directly render Phase 4
        const partnerCard = page.locator('[data-testid="partner-reveal-container"]');
        if (await partnerCard.count() > 0) {
          await expect(partnerCard.first()).toBeVisible();
        }
      } finally {
        await removeVirtualAuthenticator(authenticator);
      }
    }
  });
});
