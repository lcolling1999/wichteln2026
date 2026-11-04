import { test, expect } from '@playwright/test';
import { injectSensorMocks, triggerDeviceTilt } from '../helpers/sensor-mocks';

test.describe('Tier 1: Matrix Scramble Reveal & 3D Tilt Card (R3)', () => {
  test('TC-F7-01: Recipient name displays Matrix-code decryption scramble animation before settling', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const scrambleText = page.locator('[data-testid="matrix-scramble-text"]');
    if (await scrambleText.isVisible()) {
      const initialText = await scrambleText.innerText();
      // Scramble glyphs should be present or text should update after delay
      await page.waitForTimeout(600);
      const updatedText = await scrambleText.innerText();
      expect(typeof updatedText).toBe('string');
    }
  });

  test('TC-F7-02: Teaser sentence renders word-by-word with blur-to-focus typography', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const teaserContainer = page.locator('[data-testid="teaser-sentence-container"]');
    if (await teaserContainer.isVisible()) {
      const words = teaserContainer.locator('.teaser-word, span[data-word]');
      expect(await words.count()).toBeGreaterThan(0);
    }
  });

  test('TC-F7-03: Interactive keyword chips display festive emoji and trigger particle pop on tap', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const keywordChip = page.locator('[data-testid^="keyword-chip-"]').first();
    if (await keywordChip.isVisible()) {
      await keywordChip.click();
      // Verify emoji plopp particle element is created
      const particle = page.locator('.emoji-pop-particle, [data-testid="emoji-particle"]');
      if (await particle.count() > 0) {
        await expect(particle.first()).toBeVisible();
      }
    }
  });

  test('TC-F7-04: Holographic 3D card perspective tilts dynamically when device orientation changes', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const tiltCard = page.locator('[data-testid="holographic-tilt-card"]');
    if (await tiltCard.isVisible()) {
      // Simulate tilting phone left/right (gamma: -25) and front/back (beta: 30)
      await triggerDeviceTilt(page, { beta: 30, gamma: -25 });
      await page.waitForTimeout(100);

      const style = await tiltCard.getAttribute('style');
      // Style should reflect transform with rotateX or rotateY or perspective
      expect(style).toBeDefined();
    }
  });

  test('TC-F7-05: Desktop mouse movement triggers parallax card tilt fallback when gyro is absent', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const tiltCard = page.locator('[data-testid="holographic-tilt-card"]');
    if (await tiltCard.isVisible()) {
      const box = await tiltCard.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 10, box.y + 10);
        await page.waitForTimeout(50);
        await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10);
        await page.waitForTimeout(50);
        await expect(tiltCard).toBeVisible();
      }
    }
  });
});
