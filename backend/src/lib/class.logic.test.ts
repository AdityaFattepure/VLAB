import { describe, expect, it } from 'vitest';
import {
  classDisplayName,
  normaliseBatch,
  normaliseSection,
  normaliseJoinCode,
} from './class.logic.js';

describe('class.logic', () => {
  it('builds the label a teacher and student recognise', () => {
    expect(
      classDisplayName({
        courseShort: 'CBAD',
        section: 'CC1',
        batch: 'A',
      }),
    ).toBe('CBAD · CC1 · Batch A');
  });

  it('does not repeat the word Batch when a batch is already labelled', () => {
    expect(
      classDisplayName({
        courseShort: 'CBAD',
        section: 'CC3',
        batch: 'Batch B',
      }),
    ).toBe('CBAD · CC3 · Batch B');
  });

  it('normalises section and batch input', () => {
    expect(normaliseSection(' cc1 ')).toBe('CC1');
    expect(normaliseBatch(' b ')).toBe('B');
  });

  it('normalises join codes to uppercase without spaces', () => {
    expect(normaliseJoinCode(' cbadl1 ')).toBe('CBADL1');
  });

  it('falls back to sensible labels when section or batch are empty', () => {
    expect(
      classDisplayName({ courseShort: 'CBAD', section: '', batch: '' }),
    ).toBe('CBAD');
  });
});
