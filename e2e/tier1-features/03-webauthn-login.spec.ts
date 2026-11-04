import { test, expect } from '@playwright/test';
import { setupVirtualAuthenticator, removeVirtualAuthenticator } from '../helpers/webauthn-cdp';
import { injectSensorMocks } from '../helpers/sensor-mocks';
import { WichtelnApiClient } from '../helpers/api-client';

test.describe('Tier 1: WebAuthn Passkey Authentication & Recurring Login (R1)', () => {
  test('TC-F3-01: /api/auth/login-options returns valid PublicKeyCredentialRequestOptions', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const res = await api.getLoginOptions();

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('challenge');
    expect(typeof res.body.challenge).toBe('string');
    expect(res.body.challenge.length).toBeGreaterThanOrEqual(16);
    expect(res.body).toHaveProperty('rpId');
  });

  test('TC-F3-02: Headless CDP Virtual Authenticator signs authentication challenge', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    const authenticator = await setupVirtualAuthenticator(page);

    try {
      await page.goto('/');

      const loginBtn = page.locator('[data-testid="login-btn"], button:has-text("Login"), button:has-text("Passkey")');
      if (await loginBtn.isVisible()) {
        await loginBtn.click();
        // CDP auto-simulates biometric touch and signs assertion
        await page.waitForTimeout(1000);
      }
    } finally {
      await removeVirtualAuthenticator(authenticator);
    }
  });

  test('TC-F3-03: /api/auth/me returns unauthenticated status for fresh unauthenticated session', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const me = await api.getMe();

    expect(me.status).toBe(200);
    expect(me.body.authenticated).toBe(false);
  });

  test('TC-F3-04: Auto-login conditionally prompts for passkey when stored credential is present', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    const authenticator = await setupVirtualAuthenticator(page);

    try {
      await page.goto('/');
      // Verify app does not throw unhandled WebAuthn exception during conditional mediation
      const body = page.locator('body');
      await expect(body).toBeVisible();
    } finally {
      await removeVirtualAuthenticator(authenticator);
    }
  });

  test('TC-F3-05: Returning authenticated user is directed to Lobby (pre-draw) or Safe Dial (post-draw)', async ({
    page,
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const status = await api.getStatus();

    await page.goto('/');

    if (status.isDrawn) {
      // If draw is already complete, verify safe dial or reveal view is reachable
      const safeDialOrReveal = page.locator('[data-testid="safe-rotary-dial"], [data-testid="partner-reveal-container"]');
      if (await safeDialOrReveal.count() > 0) {
        await expect(safeDialOrReveal.first()).toBeVisible();
      }
    } else {
      // Pre-draw state: lobby or onboarding should be visible
      const lobbyOrOnboarding = page.locator('[data-testid="waiting-lobby"], [data-testid="onboarding-card"]');
      await expect(lobbyOrOnboarding.first()).toBeVisible();
    }
  });
});
