import type { SessionStatus, SubmissionStatus } from '../api/types';
import { cn } from '../lib/format';

const STYLES: Record<string, { label: string; className: string; dot: string }> = {
  starting: {
    label: 'Starting',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    dot: 'bg-amber-500 vlab-live-dot',
  },
  ready: {
    label: 'Live',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dot: 'bg-emerald-600 vlab-live-dot',
  },
  stopped: {
    label: 'Stopped',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    dot: 'bg-slate-400',
  },
  error: {
    label: 'Error',
    className: 'border-rose-200 bg-rose-50 text-rose-800',
    dot: 'bg-rose-600',
  },
};

export function StatusPill({
  status,
  className,
}: {
  status: SessionStatus | null | undefined;
  className?: string;
}) {
  const style = status
    ? STYLES[status]
    : {
        label: 'Not started',
        className: 'border-slate-200 bg-white text-slate-500',
        dot: 'bg-slate-300',
      };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        style.className,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}

const SUBMISSION_STYLES: Record<SubmissionStatus, string> = {
  draft: 'border-slate-200 bg-white text-slate-600',
  submitted: 'border-blue-200 bg-blue-50 text-blue-800',
  reviewed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

export function SubmissionBadge({
  status,
  className,
}: {
  status: SubmissionStatus | null | undefined;
  className?: string;
}) {
  const label = status === 'reviewed' ? 'Reviewed' : status === 'draft' ? 'Draft' : status ? 'Submitted' : 'Not submitted';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium',
        status ? SUBMISSION_STYLES[status] : 'border-slate-200 bg-white text-slate-500',
        className,
      )}
    >
      {label}
    </span>
  );
}
