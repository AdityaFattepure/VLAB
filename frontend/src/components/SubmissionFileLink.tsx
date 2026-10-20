import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../lib/format';

export function SubmissionFileLink({
  url,
  label = 'Open file',
  className,
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  const { download } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function open() {
    setBusy(true);
    setError('');
    const preview = window.open('', '_blank');
    if (preview) preview.opener = null;
    try {
      const blob = await download(url);
      const objectUrl = URL.createObjectURL(blob);
      if (preview) preview.location.href = objectUrl;
      else window.open(objectUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      preview?.close();
      setError(err instanceof Error ? err.message : 'Could not open the file');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className={cn('vlab-button-secondary px-3 py-1.5 text-xs', className)}
      >
        {busy ? 'Opening…' : label}
      </button>
      {error && <span className="text-[10px] text-rose-700">{error}</span>}
    </span>
  );
}
