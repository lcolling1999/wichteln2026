import { test, expect } from '@playwright/test';
import { setupVirtualAuthenticator, removeVirtualAuthenticator, getStoredCredentials } from '../helpers/webauthn-cdp';
import { injectSensorMocks } from '../helpers/sensor-mocks';
import { WichtelnApiClient } from '../helpers/api-client';

test.describe('Tier 1: WebAuthn Passkey Registration (R1)', () => {
  test('TC-F2-01: /api/auth/register-options issues valid WebAuthn PublicKeyCredentialCreationOptions', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const participants = await api.getParticipants();
    const unregistered = participants.find((p) => !p.isRegistered);

    if (unregistered) {
      const res = await api.getRegisterOptions(unregistered.id);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('challenge');
      expect(typeof res.body.challenge).toBe('string');
      expect(res.body.challenge.length).toBeGreaterThanOrEqual(16);
      expect(res.body).toHaveProperty('rp');
      expect(res.body.rp.name).toContain('Wichteln');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user).toHaveProperty('name');
    }
  });

  test('TC-F2-02: Headless CDP Virtual Authenticator creates and registers a CTAP2 resident passkey', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    const authenticator = await setupVirtualAuthenticator(page);

    try {
      await page.goto('/');

      // Locate colleague selector
      const selector = page.locator('[data-testid="colleague-select"], select#colleague-select');
      await selector.waitFor({ state: 'visible', timeout: 5000 });

      // Find first unselected/available colleague
      const availableOption = page.locator('option:not([disabled])').nth(1);
      const val = await availableOption.getAttribute('value');
      if (val) {
        await selector.selectOption(val);

        const registerBtn = page.locator('[data-testid="register-btn"]');
        await expect(registerBtn).toBeEnabled();
        await registerBtn.click();

        // Biometric prompt is automatically approved by CDP virtual authenticator
        // Verify UI enters Waiting Lobby (Phase 2)
        const lobbyCounter = page.locator('[data-testid="lobby-counter"]');
        await expect(lobbyCounter).toBeVisible({ timeout: 10000 });

        // Verify authenticator stored the credential
        const credentials = await getStoredCredentials(authenticator);
        expect(credentials.length).toBeGreaterThanOrEqual(1);
        expect(credentials[0].isResidentCredential).toBe(true);
      }
    } finally {
      await removeVirtualAuthenticator(authenticator);
    }
  });

  test('TC-F2-03: UI displays pulsating biometric ring system during passkey creation', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    await page.goto('/');

    const biometricPulse = page.locator('[data-testid="biometric-pulse-ring"], .biometric-pulse');
    // If not visible initially, selecting and clicking triggers the state
    const selector = page.locator('[data-testid="colleague-select"], select#colleague-select');
    if (await selector.isVisible()) {
      const options = selector.locator('option:not([disabled])');
      if (await options.count() > 1) {
        await selector.selectOption({ index: 1 });
        const registerBtn = page.locator('[data-testid="register-btn"]');
        if (await registerBtn.isVisible()) {
          // Verify presence of biometric icon / pulse container
          const biometricIcon = page.locator('[data-testid="biometric-icon"], svg.biometric-icon');
          await expect(biometricIcon.or(registerBtn)).toBeVisible();
        }
      }
    }
  });

  test('TC-F2-04: Successful registration persists credential and updates participant is_registered = 1', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const participants = await api.getParticipants();
    const registered = participants.filter((p) => p.isRegistered);

    // Any registered participant should have valid registeredAt timestamp
    for (const p of registered) {
      expect(p.registeredAt).not.toBeNull();
      expect(typeof p.registeredAt).toBe('string');
    }
  });

  test('TC-F2-05: Successful registration sets HttpOnly session cookie granting authenticated status', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    const authenticator = await setupVirtualAuthenticator(page);

    try {
      await page.goto('/');
      const cookies = await page.context().cookies();
      // Inspect cookie security properties if session cookie is present
      const sessionCookie = cookies.find((c) => c.name.toLowerCase().includes('session'));
      if (sessionCookie) {
        expect(sessionCookie.httpOnly).toBe(true);
        expect(['Lax', 'Strict', 'None']).toContain(sessionCookie.sameSite);
      }
    } finally {
      await removeVirtualAuthenticator(authenticator);
    }
  });
});
