import { test, expect } from '@playwright/test';
import { CANONICAL_COLLEAGUES, WichtelnApiClient } from '../helpers/api-client';

test.describe('Tier 1: Colleague Whitelist & Seeding (R1)', () => {
  test.beforeEach(async ({ request }) => {
    const api = new WichtelnApiClient(request);
    await api.resetAll();
  });

  test('TC-F1-01: System whitelist contains exactly the 24 pre-seeded colleagues', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const participants = await api.getParticipants();

    expect(participants).toHaveLength(24);

    const receivedNames = participants.map((p) => p.name);
    for (const expectedName of CANONICAL_COLLEAGUES) {
      expect(receivedNames).toContain(expectedName);
    }
  });

  test('TC-F1-02: Colleague names preserve canonical Unicode NFC formatting (especially André)', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const participants = await api.getParticipants();

    const andre = participants.find(
      (p) => p.name.normalize('NFC').toLowerCase() === 'andré'.normalize('NFC').toLowerCase()
    );
    expect(andre).toBeDefined();
    expect(andre?.name).toBe('André');
    expect(andre?.name.normalize('NFC')).toBe('André');
  });

  test('TC-F1-03: Initial status endpoint reports totalParticipants = 24 and isDrawn = false', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const status = await api.getStatus();

    expect(status.totalParticipants).toBe(24);
    expect(status.isDrawn).toBe(false);
    expect(status.drawnAt).toBeNull();
    expect(typeof status.registeredCount).toBe('number');
  });

  test('TC-F1-04: UI colleague selector displays all 24 colleagues in Phase 1 Onboarding', async ({
    page,
  }) => {
    await page.goto('/');

    // Check presence of colleague selector dropdown with auto-retrying assertion
    const selector = page.locator('[data-testid="colleague-select"], select#colleague-select');
    await expect(selector).toBeVisible();
    await expect(selector.locator('option:not([disabled])')).toHaveCount(24);
  });

  test('TC-F1-05: Colleague display names match expected first names without trailing whitespace', async ({
    request,
  }) => {
    const api = new WichtelnApiClient(request);
    const participants = await api.getParticipants();

    for (const p of participants) {
      expect(p.name).toBe(p.name.trim());
      expect(p.displayName).toBe(p.displayName.trim());
      expect(p.id).toBeGreaterThan(0);
    }
  });
});
