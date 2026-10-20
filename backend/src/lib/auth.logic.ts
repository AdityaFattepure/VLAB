export const USER_ROLES = ['teacher', 'student'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmail(email: string): boolean {
  const value = email.trim();
  // Deliberately small: the backend is not an email verification service. This
  // catches the mistakes a student actually makes without rejecting valid
  // college addresses.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !value.includes('@.');
}
