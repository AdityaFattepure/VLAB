export interface ClassIdentity {
  courseShort: string;
  section?: string | null;
  batch?: string | null;
}

export function normaliseSection(value: string): string {
  return value.trim().toUpperCase();
}

export function normaliseBatch(value: string): string {
  return value.trim().toUpperCase();
}

export function normaliseJoinCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * The label students and teachers see everywhere. Kept in one place so the
 * overview, join confirmation, and dashboard cannot drift apart.
 */
export function classDisplayName({ courseShort, section, batch }: ClassIdentity): string {
  const parts: string[] = [];
  const course = courseShort.trim() || 'Course';
  parts.push(course);

  const sectionValue = normaliseSection(section ?? '');
  if (sectionValue) parts.push(sectionValue);

  const batchValue = (batch ?? '').trim();
  if (batchValue) {
    parts.push(/^batch\b/i.test(batchValue) ? batchValue : `Batch ${normaliseBatch(batchValue)}`);
  }

  return parts.join(' · ');
}
