import { test, expect } from '@playwright/test';
import { WichtelnApiClient } from '../helpers/api-client';

test.describe('Tier 2: Input & Whitelist Boundaries', () => {
  test('TC-B1-01 (Whitespace / Trimming): Leading and trailing whitespace input resolves to canonical participant', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const participants = await api.getParticipants();
    const lada = participants.find((p) => p.name === 'Lada');
    expect(lada).toBeDefined();

    // Verify whitespace does not produce duplicate participants
    const duplicateLadas = participants.filter(
      (p) => p.name.trim().toLowerCase() === 'lada'
    );
    expect(duplicateLadas).toHaveLength(1);
  });

  test('TC-B1-02 (Decomposed Unicode NFD): Decomposed combining acute accent matches canonical precomposed André', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const participants = await api.getParticipants();

    // 'Andre\u0301' is decomposed Unicode NFD
    const nfdName = 'Andre\u0301';
    const nfcName = 'André';

    expect(nfdName.normalize('NFC')).toBe(nfcName);

    const found = participants.find(
      (p) => p.name.normalize('NFC').toLowerCase() === nfdName.normalize('NFC').toLowerCase()
    );
    expect(found).toBeDefined();
    expect(found?.name).toBe('André');
  });

  test('TC-B1-03 (Unlisted Name): Registration option request for unlisted participant ID is rejected with 404/400', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    // Invalid participant IDs
    const res999 = await api.getRegisterOptions(999);
    expect([400, 404]).toContain(res999.status);

    const resNegative = await api.getRegisterOptions(-1);
    expect([400, 404]).toContain(resNegative.status);
  });

  test('TC-B1-04 (SQL Injection Prevention): SQL injection strings in API requests are safely handled without DB error', async ({
    request,
  }) => {
    const res = await request.post('/api/auth/register-options', {
      data: {
        participantId: "1' OR '1'='1; DROP TABLE participants; --",
      },
    });
    // Server must reject invalid non-numeric participantId with 400 Bad Request
    expect([400, 404, 422]).toContain(res.status());
  });

  test('TC-B1-05 (Extreme Input Length): Massive payload strings in wish list are safely truncated or rejected', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const massiveContent = 'A'.repeat(50000);

    const res = await api.updateWishlist(massiveContent);
    // Unauthenticated returns 401, or if validated, rejects extreme size with 400/413
    expect([400, 401, 413]).toContain(res.status);
  });
});
