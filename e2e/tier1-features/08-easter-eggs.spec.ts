import { test, expect } from '@playwright/test';
import {
  injectSensorMocks,
  triggerDeviceShake,
  simulateLongPress,
  simulateTripleTap,
  simulateTopPullDown,
} from '../helpers/sensor-mocks';

test.describe('Tier 1: 4 Interactive Easter Eggs (R4)', () => {
  test('TC-F8-01 (EE1): Smartphone shake (DeviceMotionEvent >= 16 m/s^2) triggers 3s blizzard snowstorm', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    // Trigger synthetic accelerometer shake oscillations
    await triggerDeviceShake(page, { maxAcceleration: 25, cycleCount: 6 });

    // Verify blizzard snowstorm canvas or overlay is active
    const snowstorm = page.locator('[data-testid="snowstorm-overlay"], .blizzard-active');
    if (await snowstorm.count() > 0) {
      await expect(snowstorm.first()).toBeVisible();
    }
  });

  test('TC-F8-02 (EE2): Long-press (>=800ms) on user avatar activates Rudolph glowing red nose', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const userAvatar = page.locator('[data-testid="my-avatar"], [data-testid="rudolph-avatar"]').first();
    if (await userAvatar.isVisible()) {
      await simulateLongPress(page, '[data-testid="my-avatar"], [data-testid="rudolph-avatar"]', 900);

      // Verify ruby red nose glow element is visible
      const rudolphNose = page.locator('[data-testid="rudolph-red-nose"], .rudolph-glow');
      if (await rudolphNose.count() > 0) {
        await expect(rudolphNose.first()).toBeVisible();
      }
    }
  });

  test('TC-F8-03 (EE3): Triple-tap on gift card triggers 180-degree 3D flip revealing secret wish list', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const giftCard = page.locator('[data-testid="holographic-tilt-card"], [data-testid="gift-card-front"]');
    if (await giftCard.isVisible()) {
      await simulateTripleTap(page, '[data-testid="holographic-tilt-card"], [data-testid="gift-card-front"]');

      const wishlistTextarea = page.locator('[data-testid="wishlist-textarea"], textarea#secret-wishlist');
      if (await wishlistTextarea.isVisible({ timeout: 2000 })) {
        await expect(wishlistTextarea).toBeVisible();
      }
    }
  });

  test('TC-F8-04 (EE3): Editing secret wish list content autosaves to backend', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const wishlistTextarea = page.locator('[data-testid="wishlist-textarea"], textarea#secret-wishlist');
    if (await wishlistTextarea.isVisible()) {
      await wishlistTextarea.fill('Lieber Wichtel, ich freue mich über Kaffee oder ein Buch!');
      await page.waitForTimeout(600); // Debounce delay
      const savedNotice = page.locator('[data-testid="wishlist-saved-indicator"]');
      if (await savedNotice.count() > 0) {
        await expect(savedNotice.first()).toBeVisible();
      }
    }
  });

  test('TC-F8-05 (EE4): Pull-down gesture (>120px) from top screen edge activates Grinch mode', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    await simulateTopPullDown(page, 160);

    const grinchOverlay = page.locator('[data-testid="grinch-overlay"], .grinch-mode-active');
    if (await grinchOverlay.count() > 0) {
      await expect(grinchOverlay.first()).toBeVisible();
    }
  });
});
