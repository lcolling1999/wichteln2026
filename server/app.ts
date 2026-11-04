import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from './config.js';
import { participantsRouter } from './routes/participants.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { meRouter, partnerRouter } from './routes/me.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { authMiddleware } from './middlewares/auth.middleware.js';
import { errorHandler } from './middlewares/errorHandler.js';

export function createApp(): Express {
  const app = express();

  // Reverse proxy hardening: Trust the first proxy hop (Nginx, Caddy, Cloudflare, ALB)
  // Ensures req.ip correctly resolves to real client IP for rate limiting and logging
  app.set('trust proxy', 1);

  // 1. CORS Configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (config.expectedOrigins.includes(origin)) {
          return callback(null, true);
        }
        // In development, allow localhost on any port
        if (!config.isProduction && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
    })
  );

  // 2. Body Parsing & Cookie Middlewares
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  // 3. Session Context Middleware
  app.use(authMiddleware);

  // 4. API Route Mounts
  app.use('/api', participantsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/partner', partnerRouter);
  app.use('/api/admin', adminRouter);

  // 5. Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
