import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  attempts: number[];
}

export class SlidingWindowRateLimiter {
  private records = new Map<string, RateLimitEntry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(maxAttempts = 5, windowMs = 5 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;

    // Prune stale entries every 10 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.pruneStale(), 10 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  private pruneStale(): void {
    const now = Date.now();
    for (const [ip, entry] of this.records.entries()) {
      entry.attempts = entry.attempts.filter((t) => now - t < this.windowMs);
      if (entry.attempts.length === 0) {
        this.records.delete(ip);
      }
    }
  }

  public check(ip: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    let entry = this.records.get(ip);
    if (!entry) {
      entry = { attempts: [] };
      this.records.set(ip, entry);
    }

    // Filter attempts inside current sliding window
    entry.attempts = entry.attempts.filter((t) => now - t < this.windowMs);

    if (entry.attempts.length >= this.maxAttempts) {
      const oldestAttempt = entry.attempts[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestAttempt + this.windowMs - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  public recordFailure(ip: string): void {
    const entry = this.records.get(ip) || { attempts: [] };
    entry.attempts.push(Date.now());
    this.records.set(ip, entry);
  }

  public reset(ip: string): void {
    this.records.delete(ip);
  }

  public destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

export const adminLoginLimiter = new SlidingWindowRateLimiter(5, 5 * 60 * 1000);

export function adminRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const { allowed, retryAfterSeconds } = adminLoginLimiter.check(ip);

  if (!allowed) {
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.status(429).json({
      error: `Zu viele Fehlversuche. Bitte in ${retryAfterSeconds} Sekunden erneut versuchen.`,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfterSeconds,
    });
    return;
  }

  next();
}
