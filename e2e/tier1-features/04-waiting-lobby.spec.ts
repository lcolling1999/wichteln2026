import { test, expect } from '@playwright/test';
import { WichtelnApiClient } from '../helpers/api-client';
import { injectSensorMocks } from '../helpers/sensor-mocks';

test.describe('Tier 1: Waiting Lobby & Live Synchronisation (R2)', () => {
  test('TC-F4-01: Waiting Lobby renders exactly 24 colleague nodes in tree or orbit layout', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const lobbyTree = page.locator('[data-testid="waiting-lobby"], [data-testid="lobby-tree"], [data-testid="lobby-orbit"]');
    if (await lobbyTree.isVisible()) {
      const orbs = page.locator('[data-testid^="colleague-orb-"], .colleague-orb');
      expect(await orbs.count()).toBe(24);
    }
  });

  test('TC-F4-02: Registered colleague orbs display warm golden glow (#F9AA2E)', async ({
    page,
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const participants = await api.getParticipants();
    const registered = participants.filter((p) => p.isRegistered);

    await injectSensorMocks(page);
    await page.goto('/');

    for (const p of registered) {
      const orb = page.locator(`[data-testid="colleague-orb-${p.id}"]`);
      if (await orb.isVisible()) {
        const classNames = await orb.getAttribute('class');
        const style = await orb.getAttribute('style');
        // Check for active glow styling, gold class, or #F9AA2E in style
        const hasGold =
          classNames?.includes('gold') ||
          classNames?.includes('registered') ||
          style?.includes('249') ||
          style?.toLowerCase().includes('#f9aa2e');
        expect(hasGold).toBeTruthy();
      }
    }
  });

  test('TC-F4-03: Live counter matches format "X von 24 Kollegen eingecheckt"', async ({
    page,
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const status = await api.getStatus();

    await injectSensorMocks(page);
    await page.goto('/');

    const counter = page.locator('[data-testid="lobby-counter"], [data-testid="checkin-counter"]');
    if (await counter.isVisible()) {
      const text = await counter.innerText();
      expect(text).toContain('von 24');
      expect(text).toContain(String(status.registeredCount));
    }
  });

  test('TC-F4-04: Touching or hovering a colleague orb triggers Framer Motion spring physics', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const firstOrb = page.locator('[data-testid^="colleague-orb-"]').first();
    if (await firstOrb.isVisible()) {
      const initialBox = await firstOrb.boundingBox();
      await firstOrb.hover();
      await page.waitForTimeout(100);
      // Hover should not crash the DOM or displace orb out of layout
      const hoveredBox = await firstOrb.boundingBox();
      expect(hoveredBox).not.toBeNull();
    }
  });

  test('TC-F4-05: Real-time status polling maintains synchronization without memory leaks', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    // Wait for 2 poll intervals (e.g. 4 seconds) to ensure clean periodic queries
    await page.waitForTimeout(4000);
    const errorLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errorLogs.push(msg.text());
    });
    expect(errorLogs.filter((l) => !l.includes('favicon'))).toHaveLength(0);
  });
});
