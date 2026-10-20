import { describe, expect, it } from 'vitest';
import {
  MAX_SUBMISSION_BYTES,
  estimateBase64Bytes,
  safeFileName,
  submissionLabel,
  validateSubmission,
} from './submission.logic.js';

describe('submission.logic', () => {
  it('estimates the decoded size of a base64 payload', () => {
    expect(estimateBase64Bytes(Buffer.from('hello').toString('base64'))).toBe(5);
  });

  it('accepts a screenshot with a note', () => {
    const result = validateSubmission({
      note: 'Screenshot of lab 3',
      fileName: 'lab3.png',
      fileType: 'image/png',
      fileSize: 2048,
      hasFileData: true,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a Word document', () => {
    const result = validateSubmission({
      note: '',
      fileName: 'CBAD Lab 4.docx',
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 4096,
      hasFileData: true,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a ZIP archive of screenshots', () => {
    const result = validateSubmission({
      note: 'All Lab 3 screenshots',
      fileName: 'lab3-screenshots.zip',
      fileType: 'application/zip',
      fileSize: 4096,
      hasFileData: true,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an executable or unknown file type', () => {
    const result = validateSubmission({
      note: 'evidence',
      fileName: 'payload.exe',
      fileType: 'application/x-msdownload',
      fileSize: 100,
      hasFileData: true,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects files larger than the limit', () => {
    const result = validateSubmission({
      note: '',
      fileName: 'huge.pdf',
      fileType: 'application/pdf',
      fileSize: MAX_SUBMISSION_BYTES + 1,
      hasFileData: true,
    });
    expect(result.ok).toBe(false);
  });

  it('requires a file or a note', () => {
    const result = validateSubmission({
      note: '   ',
      fileName: null,
      fileType: null,
      fileSize: 0,
      hasFileData: false,
    });
    expect(result.ok).toBe(false);
  });

  it('strips path traversal from uploaded names', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\temp\\lab 1.PNG')).toBe('lab 1.PNG');
  });

  it('uses human labels for the three states', () => {
    expect(submissionLabel(null)).toBe('Not submitted');
    expect(submissionLabel('submitted')).toBe('Submitted');
    expect(submissionLabel('reviewed')).toBe('Reviewed');
  });
});
