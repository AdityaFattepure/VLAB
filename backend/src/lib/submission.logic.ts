export const MAX_SUBMISSION_BYTES = 8 * 1024 * 1024;

export const ALLOWED_SUBMISSION_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
]);

export interface SubmissionInput {
  note?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  hasFileData: boolean;
}

export type SubmissionValidation =
  | { ok: true }
  | { ok: false; error: string };

export function estimateBase64Bytes(data: string): number {
  const payload = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  const padding = /={0,2}$/.exec(payload)?.[0].length ?? 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'evidence';
  const cleaned = base.replace(/[^\w.\- ()]+/g, '_').trim();
  return cleaned.slice(0, 120) || 'evidence';
}

export function validateSubmission(input: SubmissionInput): SubmissionValidation {
  const note = (input.note ?? '').trim();

  if (!input.hasFileData) {
    return note
      ? { ok: true }
      : { ok: false, error: 'Attach a screenshot or document, or add a note before submitting' };
  }

  if (!input.fileName) return { ok: false, error: 'The attachment is missing a file name' };

  const type = (input.fileType ?? '').toLowerCase();
  if (!ALLOWED_SUBMISSION_TYPES.has(type)) {
    return {
      ok: false,
      error: 'Attach a PNG, JPG, WebP, PDF, DOC, DOCX, or ZIP file',
    };
  }

  const size = input.fileSize ?? 0;
  if (size <= 0) return { ok: false, error: 'The attachment is empty' };
  if (size > MAX_SUBMISSION_BYTES) {
    return { ok: false, error: 'Attach a file smaller than 8 MB' };
  }

  return { ok: true };
}

const LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  reviewed: 'Reviewed',
};

export function submissionLabel(status: string | null | undefined): string {
  if (!status) return 'Not submitted';
  return LABELS[status] ?? 'Submitted';
}
