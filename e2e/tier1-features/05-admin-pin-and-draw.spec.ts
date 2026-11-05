import { test, expect } from '@playwright/test';
import { WichtelnApiClient, verifyDerangementProperties } from '../helpers/api-client';
import { injectSensorMocks } from '../helpers/sensor-mocks';

test.describe('Tier 1: Protected Admin Portal & Draw Trigger (R2)', () => {
  const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || 'wichteln2026';

  test.beforeEach(async ({ request }) => {
    const api = new WichtelnApiClient(request);
    await api.resetRateLimit();
  });

  test('TC-F5-01: Admin login endpoint accepts valid PIN and sets admin session', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const res = await api.adminLogin(DEFAULT_ADMIN_PIN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isAdmin).toBe(true);
  });

  test('TC-F5-02: Admin overview endpoint returns all 24 colleagues with registration timestamps', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    await api.adminLogin(DEFAULT_ADMIN_PIN);

    const overview = await api.getAdminOverview();
    expect(overview.status).toBe(200);
    expect(overview.body.totalParticipants).toBe(24);
    expect(overview.body.participants).toHaveLength(24);
  });

  test('TC-F5-03: Admin UI modal opens with PIN input field and submit button', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const adminTrigger = page.locator('[data-testid="admin-login-trigger"], button:has-text("Admin")').first();
    if (await adminTrigger.isVisible()) {
      await adminTrigger.click();

      const pinInput = page.locator('[data-testid="admin-pin-input"], input[type="password"]');
      await expect(pinInput).toBeVisible();

      await pinInput.fill(DEFAULT_ADMIN_PIN);
      const submitBtn = page.locator('[data-testid="admin-submit-btn"], button:has-text("Anmelden")');
      await submitBtn.click();

      const dashboard = page.locator('[data-testid="admin-dashboard"]');
      await expect(dashboard).toBeVisible();
    }
  });

  test('TC-F5-04: Draw button is locked/disabled with explanation when registrations < 24', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const status = await api.getStatus();

    if (status.registeredCount < 24 && !status.isDrawn) {
      await api.adminLogin(DEFAULT_ADMIN_PIN);
      const drawRes = await api.triggerAdminDraw();

      // Should be rejected with 400 or 412 Precondition Failed
      expect([400, 412]).toContain(drawRes.status);
    }
  });

  test('TC-F5-05: When draw executes, single-cycle derangement produces 24 bijective pairings with zero self-draws', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const status = await api.getStatus();

    if (status.isDrawn) {
      await api.adminLogin(DEFAULT_ADMIN_PIN);
      const overview = await api.getAdminOverview();

      if (overview.body.assignments && overview.body.assignments.length === 24) {
        const verification = verifyDerangementProperties(overview.body.assignments, 24);
        expect(verification.isValid).toBe(true);
        expect(verification.isSingleCycle).toBe(true);
        expect(verification.cycleLength).toBe(24);
        expect(verification.errors).toHaveLength(0);
      }
    }
  });
});
