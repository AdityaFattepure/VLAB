import { describe, expect, it } from 'vitest';
import { isEmail, isUserRole, normalizeEmail } from './auth.logic.js';

describe('auth.logic', () => {
  it('normalises email addresses before lookup', () => {
    expect(normalizeEmail('  Aarav.Sharma@VLAB.dev ')).toBe('aarav.sharma@vlab.dev');
  });

  it('accepts a normal college email address', () => {
    expect(isEmail('student@mituniversity.edu.in')).toBe(true);
  });

  it('rejects addresses without a domain or dot', () => {
    expect(isEmail('student@localhost')).toBe(false);
    expect(isEmail('student')).toBe(false);
    expect(isEmail('student@.edu')).toBe(false);
  });

  it('only accepts the two supported roles', () => {
    expect(isUserRole('teacher')).toBe(true);
    expect(isUserRole('student')).toBe(true);
    expect(isUserRole('admin')).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
  });
});
