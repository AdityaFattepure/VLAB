import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { StudentAssignment } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { SubmissionBadge } from './StatusPill';
import { SubmissionFileLink } from './SubmissionFileLink';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
];

export function SubmissionModal({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: StudentAssignment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api } = useAuth();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState(assignment.submission?.note ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function chooseFile(selected: File | null) {
    setError('');
    if (!selected) {
      setFile(null);
      setDataUrl('');
      return;
    }
    if (!ALLOWED.includes(selected.type)) {
      setError('Attach a PNG, JPG, WebP, PDF, DOC, DOCX, or ZIP file.');
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError('Attach a file smaller than 8 MB.');
      return;
    }
    setFile(selected);
    const reader = new FileReader();
    reader.onload = () => setDataUrl(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => setError('Could not read that file. Try another one.');
    reader.readAsDataURL(selected);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!file && !note.trim() && !assignment.submission?.fileName) {
      setError('Attach a file or write a note before submitting.');
      return;
    }
    if (file && !dataUrl) {
      setError('The file is still loading. Try again in a moment.');
      return;
    }

    setBusy(true);
    try {
      await api(`/assignments/${assignment.id}/submission`, {
        method: 'PUT',
        body: {
          note,
          fileName: file?.name ?? null,
          fileType: file?.type ?? null,
          dataBase64: file ? dataUrl : null,
        },
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the evidence');
    } finally {
      setBusy(false);
    }
  }

  const submission = assignment.submission;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close submission dialog"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="submission-title"
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="vlab-eyebrow">Evidence submission</div>
            <h2 id="submission-title" className="mt-1 text-lg font-semibold text-slate-900">
              {assignment.lab.code ? `${assignment.lab.code} — ` : ''}
              {assignment.lab.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{assignment.class.name}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="vlab-button-secondary px-2.5 py-1.5 text-xs"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4">
          {assignment.instructions && (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              {assignment.instructions}
            </p>
          )}

          {submission && (
            <div className="mt-3 rounded-md border border-slate-200 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <SubmissionBadge status={submission.status} />
                {submission.grade !== null && (
                  <span className="text-slate-500">Grade {submission.grade}/100</span>
                )}
                {submission.fileUrl && (
                  <SubmissionFileLink url={submission.fileUrl} label="Open current file" />
                )}
              </div>
              {submission.feedback && (
                <p className="mt-2 rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-emerald-800">
                  Teacher feedback: {submission.feedback}
                </p>
              )}
            </div>
          )}

          {saved ? (
            <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-4 text-center">
              <div className="text-sm font-semibold text-emerald-900">Evidence submitted</div>
              <p className="mt-1 text-xs text-emerald-800">
                Your teacher can now open the file and leave feedback.
              </p>
              <button type="button" onClick={onClose} className="vlab-button-primary mt-3 px-4 py-2 text-xs">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
              <label className="block">
                <span className="vlab-label">Screenshot or document</span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.zip"
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                  className="block w-full cursor-pointer rounded-md border border-slate-300 bg-white text-xs text-slate-600 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  PNG, JPG, WebP, PDF, DOC, DOCX, or ZIP · up to 8 MB. One file per submission;
                  combine your screenshots into a single document if needed.
                </span>
              </label>

              {file && (
                <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <span className="truncate text-slate-700">{file.name}</span>
                  <button type="button" onClick={() => chooseFile(null)} className="text-slate-500 hover:text-slate-800">
                    Remove
                  </button>
                </div>
              )}

              <label className="block">
                <span className="vlab-label">Note for your teacher (optional)</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  className="vlab-input"
                  placeholder="What does this evidence show? Anything that did not work?"
                />
              </label>

              {error && (
                <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="vlab-button-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="vlab-button-primary">
                  {busy ? 'Submitting…' : submission ? 'Resubmit evidence' : 'Submit evidence'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
