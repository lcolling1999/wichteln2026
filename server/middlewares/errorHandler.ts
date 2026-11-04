import { Request, Response, NextFunction } from 'express';
import { WebAuthnError } from '../services/webauthn.service.js';
import { AdminError } from '../services/admin.service.js';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof WebAuthnError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code || 'WEBAUTHN_ERROR',
    });
    return;
  }

  if (err instanceof AdminError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code || 'ADMIN_ERROR',
      ...err.details,
    });
    return;
  }

  // Body parser syntax error (invalid JSON)
  if (err.type === 'entity.parse.failed' || err.status === 400) {
    res.status(400).json({
      error: 'Ungültiges JSON-Format.',
      code: 'INVALID_JSON',
    });
    return;
  }

  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Interner Serverfehler.',
    code: 'INTERNAL_SERVER_ERROR',
  });
}
