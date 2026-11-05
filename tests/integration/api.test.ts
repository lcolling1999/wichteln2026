import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { setDatabase } from '../../server/db/database.js';
import { initializeSchema } from '../../server/db/schema.js';
import { seedDatabase } from '../../server/db/seeds.js';
import { createQueryLayer } from '../../server/db/queries.js';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { adminLoginLimiter } from '../../server/middlewares/rateLimit.js';

describe('Express REST API Integration Tests', () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    // Reset rate limiter IP table for test isolation
    adminLoginLimiter.reset('::ffff:127.0.0.1');
    adminLoginLimiter.reset('127.0.0.1');
    adminLoginLimiter.reset('unknown');

    // Fresh in-memory database
    db = new DatabaseSync(':memory:', {
      enableForeignKeyConstraints: true,
    });
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    initializeSchema(db);
    seedDatabase(db);
    setDatabase(db);

    app = createApp();
  });

  describe('Public Endpoints', () => {
    it('GET /api/status returns initial pre-draw state with 24 total participants', async () => {
      const res = await request(app).get('/api/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        isDrawn: false,
        totalParticipants: 24,
        registeredCount: 0,
        drawnAt: null,
        verificationHash: null,
      });
    });

    it('GET /api/participants returns all 24 colleagues with public profile only', async () => {
      const res = await request(app).get('/api/participants');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(24);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('displayName');
      expect(res.body[0]).toHaveProperty('isRegistered');
      expect(res.body[0]).not.toHaveProperty('authenticators');
      expect(res.body[0]).not.toHaveProperty('assignment');
    });
  });

  describe('Auth Status & Options Endpoints', () => {
    it('GET /api/auth/me returns unauthenticated status for anonymous request', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        authenticated: false,
        isAdmin: false,
        participant: null,
      });
    });

    it('POST /api/auth/register-options generates creation options for unregistered colleague', async () => {
      const res = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId: 1 });

      expect(res.status).toBe(200);
      expect(res.body.challenge).toBeDefined();
      expect(res.body.rp.name).toBe('Wichteln 24 Kollegen');
      expect(res.body.user.name).toBe('Lada');
    });

    it('POST /api/auth/register-options rejects invalid participantId with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register-options')
        .send({ participantId: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    it('POST /api/auth/login-options generates request options', async () => {
      const res = await request(app)
        .post('/api/auth/login-options')
        .send({ participantId: 1 });

      expect(res.status).toBe(200);
      expect(res.body.challenge).toBeDefined();
    });

    it('POST /api/auth/logout clears session cookie', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toMatch(/session_token=;/);
    });
  });

  describe('Admin Security & Rate Limiting', () => {
    it('POST /api/admin/login rejects incorrect PIN with 401', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ pin: 'wrong-pin' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/ungültig/i);
    });

    it('POST /api/admin/login enforces 5-attempt rate limit and returns 429', async () => {
      for (let i = 0; i < 5; i++) {
        const attempt = await request(app).post('/api/admin/login').send({ pin: 'wrong' });
        expect(attempt.status).toBe(401);
      }

      const res = await request(app).post('/api/admin/login').send({ pin: 'wrong' });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res.headers['retry-after']).toBeDefined();
    });

    it('POST /api/admin/login accepts correct PIN and issues session cookie', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ pin: config.adminPin });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isAdmin).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toMatch(/session_token=/);
    });
  });

  describe('Draw Trigger & Admin Operations', () => {
    it('POST /api/admin/draw blocks draw when registrations < 24 and partial draw is disabled', async () => {
      // Login as admin
      const loginRes = await request(app).post('/api/admin/login').send({ pin: config.adminPin });
      const cookie = loginRes.headers['set-cookie'];

      config.allowPartialDraw = false;

      const drawRes = await request(app)
        .post('/api/admin/draw')
        .set('Cookie', cookie);

      expect(drawRes.status).toBe(400);
      expect(drawRes.body.code).toBe('REGISTRATIONS_INCOMPLETE');
      expect(drawRes.body.registeredCount).toBe(0);
      expect(drawRes.body.requiredCount).toBe(24);
    });

    it('POST /api/admin/draw succeeds with ALLOW_PARTIAL_DRAW=true when >= 2 participants registered', async () => {
      const q = createQueryLayer(db);
      // Register 3 participants
      q.setParticipantRegistered(1);
      q.setParticipantRegistered(2);
      q.setParticipantRegistered(3);

      const loginRes = await request(app).post('/api/admin/login').send({ pin: config.adminPin });
      const cookie = loginRes.headers['set-cookie'];

      config.allowPartialDraw = true;

      const drawRes = await request(app)
        .post('/api/admin/draw')
        .set('Cookie', cookie);

      expect(drawRes.status).toBe(200);
      expect(drawRes.body.success).toBe(true);
      expect(drawRes.body.pairCount).toBe(3);
      expect(drawRes.body.verificationHash).toHaveLength(64);

      // Status reflects draw
      const statusRes = await request(app).get('/api/status');
      expect(statusRes.body.isDrawn).toBe(true);
      expect(statusRes.body.verificationHash).toBe(drawRes.body.verificationHash);

      // Attempting second draw returns 409 Conflict
      const secondDrawRes = await request(app)
        .post('/api/admin/draw')
        .set('Cookie', cookie);

      expect(secondDrawRes.status).toBe(409);
      expect(secondDrawRes.body.code).toBe('ALREADY_DRAWN');
    });

    it('GET /api/admin/overview returns full dashboard data for admin', async () => {
      const loginRes = await request(app).post('/api/admin/login').send({ pin: config.adminPin });
      const cookie = loginRes.headers['set-cookie'];

      const res = await request(app)
        .get('/api/admin/overview')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.totalParticipants).toBe(24);
      expect(res.body.participants).toHaveLength(24);
      expect(res.body.teasers).toHaveLength(24);
    });

    it('PUT /api/admin/teasers/:id updates teaser sentence and keywords', async () => {
      const loginRes = await request(app).post('/api/admin/login').send({ pin: config.adminPin });
      const cookie = loginRes.headers['set-cookie'];

      const res = await request(app)
        .put('/api/admin/teasers/1')
        .set('Cookie', cookie)
        .send({
          sentence: 'Neuer Test-Teaser-Satz für Lada!',
          keywords: [{ word: 'Test', emoji: '🧪' }],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const q = createQueryLayer(db);
      const teaser = q.getTeaserByParticipantId(1);
      expect(teaser?.sentence).toBe('Neuer Test-Teaser-Satz für Lada!');
    });

    it('POST /api/admin/reset-participant resets registration before draw', async () => {
      const q = createQueryLayer(db);
      q.setParticipantRegistered(1);
      expect(q.getParticipantById(1)?.is_registered).toBe(1);

      const loginRes = await request(app).post('/api/admin/login').send({ pin: config.adminPin });
      const cookie = loginRes.headers['set-cookie'];

      const res = await request(app)
        .post('/api/admin/reset-participant')
        .set('Cookie', cookie)
        .send({ participantId: 1 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(q.getParticipantById(1)?.is_registered).toBe(0);
    });
  });

  describe('Zero-Leakage Assignment & Wishlist API', () => {
    it('GET /api/me/assignment requires authentication', async () => {
      const res = await request(app).get('/api/me/assignment');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PARTICIPANT_REQUIRED');
    });

    it('GET /api/me/assignment returns isDrawn=false before draw', async () => {
      const q = createQueryLayer(db);
      const sessionToken = q.createSession(1, false);

      const res = await request(app)
        .get('/api/me/assignment')
        .set('Cookie', `session_token=${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isDrawn: false });
    });

    it('GET /api/me/assignment returns only own partner and teaser post-draw (zero-leakage)', async () => {
      const q = createQueryLayer(db);
      // Register 3 participants
      q.setParticipantRegistered(1);
      q.setParticipantRegistered(2);
      q.setParticipantRegistered(3);

      config.allowPartialDraw = true;

      // Draw assignments
      const loginRes = await request(app).post('/api/admin/login').send({ pin: config.adminPin });
      await request(app)
        .post('/api/admin/draw')
        .set('Cookie', loginRes.headers['set-cookie']);

      // Login as participant 1
      const sessionToken = q.createSession(1, false);

      const res = await request(app)
        .get('/api/me/assignment')
        .set('Cookie', `session_token=${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isDrawn).toBe(true);
      expect(res.body.partner).toBeDefined();
      expect(res.body.partner.id).not.toBe(1); // Not self
      expect(res.body.teaser).toBeDefined();
      expect(res.body.teaser.sentence).toBeDefined();
      expect(Array.isArray(res.body.teaser.keywords)).toBe(true);

      // Zero-Leakage Checks:
      expect(res.body).not.toHaveProperty('giver');
      expect(res.body).not.toHaveProperty('pairs');
      expect(res.body).not.toHaveProperty('assignments');
    });

    it('GET and PUT /api/me/wishlist manages personal wishlist note', async () => {
      const q = createQueryLayer(db);
      const sessionToken = q.createSession(1, false);
      const cookie = `session_token=${sessionToken}`;

      // Get initial empty wishlist
      const getRes = await request(app).get('/api/me/wishlist').set('Cookie', cookie);
      expect(getRes.status).toBe(200);
      expect(getRes.body.content).toBe('');

      // Update wishlist
      const putRes = await request(app)
        .put('/api/me/wishlist')
        .set('Cookie', cookie)
        .send({ content: 'Ein gutes Buch oder feiner Kaffee!' });

      expect(putRes.status).toBe(200);
      expect(putRes.body.success).toBe(true);
      expect(putRes.body.content).toBe('Ein gutes Buch oder feiner Kaffee!');

      // Retrieve updated wishlist
      const getRes2 = await request(app).get('/api/me/wishlist').set('Cookie', cookie);
      expect(getRes2.body.content).toBe('Ein gutes Buch oder feiner Kaffee!');
    });

    it('GET /api/partner/wishlist retrieves partner note after draw', async () => {
      const q = createQueryLayer(db);
      // Register 2 participants
      q.setParticipantRegistered(1);
      q.setParticipantRegistered(2);

      // Participant 2 writes a wishlist
      q.upsertWishList(2, 'Ich wünsche mir warme Socken!');

      config.allowPartialDraw = true;

      // Force assignment: 1 -> 2 and 2 -> 1
      q.saveDrawAssignments(
        [
          { giver_id: 1, receiver_id: 2 },
          { giver_id: 2, receiver_id: 1 },
        ],
        { adminSessionId: 'admin-test', verificationHash: 'a'.repeat(64), drawnAt: new Date().toISOString() }
      );

      const sessionToken1 = q.createSession(1, false);

      const res = await request(app)
        .get('/api/partner/wishlist')
        .set('Cookie', `session_token=${sessionToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.partnerName).toBe('Sara');
      expect(res.body.content).toBe('Ich wünsche mir warme Socken!');
    });
  });

  describe('Test Mode Endpoints (/api/test)', () => {
    it('POST /api/test/reset-rate-limit clears rate limit state', async () => {
      // Intentionally trigger rate limit
      for (let i = 0; i < 5; i++) {
        adminLoginLimiter.recordFailure('127.0.0.1');
      }
      expect(adminLoginLimiter.check('127.0.0.1').allowed).toBe(false);

      const res = await request(app).post('/api/test/reset-rate-limit');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Limiter should now allow requests
      expect(adminLoginLimiter.check('127.0.0.1').allowed).toBe(true);
    });

    it('POST /api/test/reset-draw-state reverts drawn state to is_drawn = 0 and clears assignments', async () => {
      const q = createQueryLayer(db);
      q.saveDrawAssignments(
        [{ giver_id: 1, receiver_id: 2 }],
        { adminSessionId: 'admin-test', verificationHash: 'a'.repeat(64), drawnAt: new Date().toISOString() }
      );
      expect(q.getDrawStatus().is_drawn).toBe(1);

      const res = await request(app).post('/api/test/reset-draw-state');
      expect(res.status).toBe(200);
      expect(res.body.isDrawn).toBe(false);

      expect(q.getDrawStatus().is_drawn).toBe(0);
      expect(q.getAllAssignmentsWithNames()).toHaveLength(0);
    });
  });
});
