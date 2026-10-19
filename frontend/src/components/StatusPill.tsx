import type { SessionStatus } from '../api/types';
import { cn } from '../lib/format';

const STYLES: Record<string, { label: string; className: string; dot: string }> = {
  starting: {
    label: 'Starting',
    className: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
    dot: 'bg-amber-400 vlab-live-dot',
  },
  ready: {
    label: 'Live',
    className: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
    dot: 'bg-emerald-400 vlab-live-dot',
  },
  stopped: {
    label: 'Stopped',
    className: 'bg-slate-500/10 text-slate-400 ring-slate-600/40',
    dot: 'bg-slate-500',
  },
  error: {
    label: 'Error',
    className: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
    dot: 'bg-rose-400',
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
        className: 'bg-slate-800/60 text-slate-400 ring-slate-700',
        dot: 'bg-slate-600',
      };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1',
        style.className,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}
