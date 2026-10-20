import { cn } from '../lib/format';

export function ProgressBar({
  value,
  className,
  tone = 'navy',
}: {
  value: number;
  className?: string;
  tone?: 'navy' | 'emerald';
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-200', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all duration-500',
          tone === 'emerald' ? 'bg-emerald-600' : 'bg-[#123a63]',
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
