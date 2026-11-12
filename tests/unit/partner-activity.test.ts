import { describe, it, expect } from 'vitest';
import { toActivityBucket } from '../../server/routes/me.routes.js';

describe('toActivityBucket (partner last-activity, privacy-preserving buckets)', () => {
  // 2026-12-10 14:00 Berlin (CET, UTC+1)
  const now = new Date('2026-12-10T13:00:00Z');

  it('returns never for missing or invalid timestamps', () => {
    expect(toActivityBucket(null, now)).toEqual({ status: 'never' });
    expect(toActivityBucket('kaputt', now)).toEqual({ status: 'never' });
  });

  it('returns online within the last 5 minutes', () => {
    expect(toActivityBucket('2026-12-10 12:57:00', now)).toEqual({ status: 'online' });
  });

  it('returns today for earlier activity on the same Berlin calendar day', () => {
    expect(toActivityBucket('2026-12-10 06:00:00', now)).toEqual({ status: 'today' });
  });

  it('uses the Berlin day boundary, not UTC', () => {
    // 23:30 UTC on the 9th = 00:30 Berlin on the 10th -> today
    expect(toActivityBucket('2026-12-09 23:30:00', now)).toEqual({ status: 'today' });
    // 22:30 UTC on the 9th = 23:30 Berlin on the 9th -> yesterday
    expect(toActivityBucket('2026-12-09 22:30:00', now)).toEqual({ status: 'yesterday' });
  });

  it('returns days with the number of calendar days for older activity', () => {
    expect(toActivityBucket('2026-12-07 10:00:00', now)).toEqual({ status: 'days', daysAgo: 3 });
  });
});
