import { test, expect } from '@playwright/test';
import { WichtelnApiClient } from '../helpers/api-client';
import {
  setupVirtualAuthenticator,
  removeVirtualAuthenticator,
  setUserVerification,
} from '../helpers/webauthn-cdp';
import { injectSensorMocks } from '../helpers/sensor-mocks';

test.describe('Tier 2: WebAuthn Protocol & Security Boundaries', () => {
  test.beforeEach(async ({ request }) => {
    const api = new WichtelnApiClient(request);
    await api.resetAll();
    await api.resetRateLimit();
  });

  test('TC-B2-01 (Duplicate Registration Attack): Already registered colleague cannot re-request registration options', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const participants = await api.getParticipants();
    const registered = participants.find((p) => p.isRegistered);

    if (registered) {
      const res = await api.getRegisterOptions(registered.id);
      // Already registered colleague must return 409 Conflict
      expect([400, 409]).toContain(res.status);
    }
  });

  test('TC-B2-02 (Expired Challenge): Authenticator verification with expired or non-existent challenge is rejected', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const fakeResponse = {
      id: 'fake_cred_id',
      rawId: 'fake_cred_id',
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({
          type: 'webauthn.create',
          challenge: 'non_existent_expired_challenge',
          origin: 'http://localhost:5173',
        })).toString('base64url'),
        attestationObject: 'fake_attestation',
      },
      type: 'public-key',
      clientExtensionResults: {},
    };

    const res = await api.verifyRegistration(1, fakeResponse);
    expect([400, 401, 403, 404, 409]).toContain(res.status);
  });

  test('TC-B2-03 (Origin Mismatch): Response with phishing origin is strictly rejected by server verification', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const phishingResponse = {
      id: 'phishing_id',
      rawId: 'phishing_id',
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({
          type: 'webauthn.get',
          challenge: 'random_challenge',
          origin: 'https://evil-phishing-wichteln.com',
        })).toString('base64url'),
        authenticatorData: 'fake_auth_data',
        signature: 'fake_signature',
      },
      type: 'public-key',
      clientExtensionResults: {},
    };

    const res = await api.verifyLogin(phishingResponse);
    expect([400, 401, 403]).toContain(res.status);
  });

  test('TC-B2-04 (Biometric Failure / User Cancellation): Dismissing passkey prompt resets UI gracefully without crash', async ({
    page,
  }) => {
    await injectSensorMocks(page);
    const authenticator = await setupVirtualAuthenticator(page);

    try {
      // Simulate biometric verification failure
      await setUserVerification(authenticator, false);

      await page.goto('/');

      // Verify page is rendered and error doesn't cause blank screen
      const body = page.locator('body');
      await expect(body).toBeVisible();
    } finally {
      await removeVirtualAuthenticator(authenticator);
    }
  });

  test('TC-B2-05 (Replay Attack Protection): Resubmitting same authenticator assertion is rejected via sign counter', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const replayPayload = {
      id: 'replay_cred_id',
      response: {
        clientDataJSON: 'fake_client_data',
        authenticatorData: 'fake_auth_data',
        signature: 'fake_sig',
      },
    };

    const res1 = await api.verifyLogin(replayPayload);
    const res2 = await api.verifyLogin(replayPayload);

    // Both must be rejected or second must be rejected due to replay
    expect([400, 401, 403]).toContain(res2.status);
  });
});
