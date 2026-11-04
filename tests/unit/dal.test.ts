import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initializeSchema } from '../../server/db/schema.js';
import { seedDatabase, SEED_COLLEAGUES } from '../../server/db/seeds.js';
import { createQueryLayer } from '../../server/db/queries.js';
import { runTransaction } from '../../server/db/database.js';

describe('SQLite DAL & Schema Tests', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:', {
      enableForeignKeyConstraints: true,
    });
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    initializeSchema(db);
  });

  describe('Schema & Constraints', () => {
    it('enforces check constraint on assignments (giver cannot equal receiver)', () => {
      const q = createQueryLayer(db);
      seedDatabase(db);

      expect(() => {
        db.prepare('INSERT INTO assignments (giver_id, receiver_id) VALUES (1, 1)').run();
      }).toThrow();
    });

    it('enforces unique constraints on assignments (giver_id and receiver_id)', () => {
      seedDatabase(db);

      // Insert valid pair (1 -> 2)
      db.prepare('INSERT INTO assignments (giver_id, receiver_id) VALUES (1, 2)').run();

      // Duplicate giver 1 -> 3 must fail
      expect(() => {
        db.prepare('INSERT INTO assignments (giver_id, receiver_id) VALUES (1, 3)').run();
      }).toThrow();

      // Duplicate receiver 3 -> 2 must fail
      expect(() => {
        db.prepare('INSERT INTO assignments (giver_id, receiver_id) VALUES (3, 2)').run();
      }).toThrow();
    });

    it('enforces singleton state on draw_status (id must be 1)', () => {
      db.prepare('INSERT INTO draw_status (id, is_drawn) VALUES (1, 0)').run();

      // Attempting to insert id=2 must fail CHECK (id = 1)
      expect(() => {
        db.prepare('INSERT INTO draw_status (id, is_drawn) VALUES (2, 0)').run();
      }).toThrow();
    });

    it('enforces foreign key cascading when participant is deleted', () => {
      seedDatabase(db);
      const q = createQueryLayer(db);

      // Create authenticator for participant 1
      q.createAuthenticator({
        id: 'auth-test-1',
        participant_id: 1,
        public_key: Buffer.from('test-key'),
        counter: 0,
      });

      expect(q.getAuthenticatorsByParticipantId(1)).toHaveLength(1);

      // Delete participant 1 directly
      db.prepare('DELETE FROM participants WHERE id = 1').run();

      // Cascading foreign keys delete authenticators and wishlists
      expect(q.getAuthenticatorsByParticipantId(1)).toHaveLength(0);
      expect(q.getWishList(1)).toBeNull();
    });
  });

  describe('Unicode & NFC Normalization (André)', () => {
    it('correctly normalizes and finds André via normalized_name', () => {
      seedDatabase(db);
      const q = createQueryLayer(db);

      // Various representations of "André"
      const nfcExact = 'André';
      const nfcLower = 'andré';
      const decomposed = 'Andre\u0301'; // 'e' + combining acute accent U+0301
      const uppercase = 'ANDRÉ';

      const found1 = q.findParticipantByName(nfcExact);
      const found2 = q.findParticipantByName(nfcLower);
      const found3 = q.findParticipantByName(decomposed);
      const found4 = q.findParticipantByName(uppercase);

      expect(found1).toBeDefined();
      expect(found1?.name).toBe('André');
      expect(found2?.id).toBe(found1?.id);
      expect(found3?.id).toBe(found1?.id);
      expect(found4?.id).toBe(found1?.id);
    });
  });

  describe('Pre-Seeding Idempotency', () => {
    it('seeds exactly 24 participants and teasers idempotently', () => {
      const firstRun = seedDatabase(db);
      expect(firstRun.participants).toBe(24);
      expect(firstRun.teasers).toBe(24);

      const q = createQueryLayer(db);
      expect(q.getAllParticipants()).toHaveLength(24);
      expect(q.getAllTeasers()).toHaveLength(24);

      // Mark one participant as registered
      q.setParticipantRegistered(1);
      expect(q.getRegisteredCount()).toBe(1);

      // Run seeding a second time
      const secondRun = seedDatabase(db);
      expect(secondRun.participants).toBe(24);

      // Verify count remains 24 and registration status is preserved
      expect(q.getAllParticipants()).toHaveLength(24);
      expect(q.getRegisteredCount()).toBe(1);
    });
  });

  describe('Transaction Rollback Support', () => {
    it('rolls back database modifications when an exception is thrown in runTransaction', () => {
      seedDatabase(db);
      const q = createQueryLayer(db);

      const countBefore = q.getRegisteredCount();

      expect(() => {
        runTransaction(db, () => {
          q.setParticipantRegistered(1);
          q.setParticipantRegistered(2);
          throw new Error('Simulated failure inside transaction');
        });
      }).toThrow('Simulated failure inside transaction');

      // State must be completely rolled back
      expect(q.getRegisteredCount()).toBe(countBefore);
    });
  });
});
