import { Link } from 'react-router-dom';
import { cn } from '../lib/format';

export function Brand({
  compact = false,
  light = false,
  to = '/',
}: {
  compact?: boolean;
  light?: boolean;
  to?: string;
}) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5" aria-label="VLab home">
      <span
        className={cn(
          'grid h-9 w-9 place-items-center rounded-md text-sm font-semibold',
          light ? 'bg-white text-[#0b2744]' : 'bg-[#0b2744] text-white',
        )}
        aria-hidden
      >
        V
      </span>
      <span className="leading-tight">
        <span className={cn('block text-sm font-semibold tracking-tight', light ? 'text-white' : 'text-slate-900')}>
          VLab
        </span>
        {!compact && (
          <span className={cn('block text-[10px] uppercase tracking-[0.16em]', light ? 'text-blue-200' : 'text-slate-500')}>
            Virtual Lab
          </span>
        )}
      </span>
    </Link>
  );
}
