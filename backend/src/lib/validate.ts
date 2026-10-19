import type { Request } from 'express';
import { HttpError } from './errors.js';

/** Express 5 types params as string | string[]; routes here never use arrays. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function reqString(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number } = {},
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${field} is required`);
  }
  const result = value.trim();
  if (opts.min && result.length < opts.min) {
    throw new HttpError(400, `${field} must be at least ${opts.min} characters`);
  }
  if (opts.max && result.length > opts.max) {
    throw new HttpError(400, `${field} must be at most ${opts.max} characters`);
  }
  return result;
}

export function optString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function optInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}
