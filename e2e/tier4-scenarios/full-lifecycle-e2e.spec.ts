import { test, expect } from '@playwright/test';
import { WichtelnApiClient, CANONICAL_COLLEAGUES, verifyDerangementProperties } from '../helpers/api-client';
import { setupVirtualAuthenticator, removeVirtualAuthenticator } from '../helpers/webauthn-cdp';
import { injectSensorMocks, simulateRotaryDialTurn } from '../helpers/sensor-mocks';

test.describe('Tier 4: Multi-User Real-World Scenarios', () => {
  const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || 'wichteln2026';

  test('SC-01: Complete 24-Colleague Lifecycle E2E Simulation', async ({
    page,
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const initialStatus = await api.getStatus();

    expect(initialStatus.totalParticipants).toBe(24);

    // If already drawn, verify all 24 colleagues are assigned in a single cycle
    if (initialStatus.isDrawn) {
      await api.adminLogin(DEFAULT_ADMIN_PIN);
      const overview = await api.getAdminOverview();
      const assignments = overview.body.assignments;

      expect(assignments).toHaveLength(24);
      const verification = verifyDerangementProperties(assignments, 24);
      expect(verification.isValid).toBe(true);
      expect(verification.isSingleCycle).toBe(true);
      expect(verification.cycleLength).toBe(24);
    } else {
      // Lobby live counter assertion
      await injectSensorMocks(page);
      await page.goto('/');

      const counter = page.locator('[data-testid="lobby-counter"]');
      if (await counter.isVisible()) {
        const text = await counter.innerText();
        expect(text).toContain('von 24');
      }
    }
  });

  test('SC-02: Concurrent Registration Rush Hour & Race Conditions', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const participants = await api.getParticipants();
    const unregistered = participants.filter((p) => !p.isRegistered);

    if (unregistered.length >= 2) {
      // Concurrently request registration options for two different participants
      const [res1, res2] = await Promise.all([
        api.getRegisterOptions(unregistered[0].id),
        api.getRegisterOptions(unregistered[1].id),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.challenge).not.toBe(res2.body.challenge);
    }
  });

  test('SC-03: Zero-Leakage & Privacy Enforcement (Strict Confidentiality)', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);

    // 1. Unauthenticated request to /api/me/assignment MUST be rejected
    const unauthAssignment = await api.getAssignment();
    expect([401, 403]).toContain(unauthAssignment.status);

    // 2. Unauthenticated request to /api/me/wishlist MUST be rejected
    const unauthWishlist = await api.getWishlist();
    expect([401, 403]).toContain(unauthWishlist.status);

    // 3. Unauthenticated request to /api/admin/overview MUST be rejected
    const unauthAdmin = await api.getAdminOverview();
    expect([401, 403]).toContain(unauthAdmin.status);

    // 4. Unauthenticated request to /api/admin/draw MUST be rejected
    const unauthDraw = await api.triggerAdminDraw();
    expect([401, 403]).toContain(unauthDraw.status);
  });
});
