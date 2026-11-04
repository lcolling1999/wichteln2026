import dotenv from 'dotenv';
dotenv.config();

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  rpName: string;
  rpID: string;
  expectedOrigins: string[];
  sessionMaxAgeMs: number;
  challengeTtlMs: number;
  adminPin: string;
  allowPartialDraw: boolean;
  databasePath: string;
}

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
];

export const config: ServerConfig = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  rpName: process.env.RP_NAME || 'Wichteln 24 Kollegen',
  rpID: process.env.RP_ID || 'localhost',
  expectedOrigins: process.env.ORIGINS
    ? process.env.ORIGINS.split(',').map((o) => o.trim())
    : defaultOrigins,
  sessionMaxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  challengeTtlMs: 5 * 60 * 1000, // 5 minutes
  adminPin: process.env.ADMIN_PIN || 'wichteln2026',
  allowPartialDraw: process.env.ALLOW_PARTIAL_DRAW === 'true',
  databasePath: process.env.DATABASE_PATH || './data/wichteln.db',
};
