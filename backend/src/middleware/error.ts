import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  console.error('[error]', message);

  // Docker daemon errors are the most common runtime failure; surface a
  // readable message instead of a 500 with a stack trace.
  const statusCode = (err as { statusCode?: number }).statusCode;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    res.status(statusCode).json({ error: message });
    return;
  }

  res.status(500).json({ error: message });
}
