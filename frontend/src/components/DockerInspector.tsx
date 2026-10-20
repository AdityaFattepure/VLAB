import { useState } from 'react';
import type { DockerInventory } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { usePolling } from '../hooks/usePolling';
import { cn } from '../lib/format';

type InventoryTab = 'containers' | 'images' | 'networks' | 'volumes';

function shortId(value: string): string {
  return value.replace(/^sha256:/, '').slice(0, 12);
}

function stateTone(state: string): string {
  if (state === 'running') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (state === 'exited' || state === 'created') return 'bg-slate-50 text-slate-600 border-slate-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function Empty({ children }: { children: string }) {
  return (
    <div className="grid min-h-40 place-items-center px-4 py-8 text-center text-xs text-slate-500">
      {children}
    </div>
  );
}

export function DockerInspector({
  sessionId,
  className,
}: {
  sessionId: string;
  className?: string;
}) {
  const { api } = useAuth();
  const [tab, setTab] = useState<InventoryTab>('containers');
  const { data, error, refresh } = usePolling<DockerInventory>(
    () => api<DockerInventory>(`/sessions/${sessionId}/docker`),
    5000,
    [sessionId],
  );

  const tabs: { id: InventoryTab; label: string; count: number }[] = [
    { id: 'containers', label: 'Containers', count: data?.containers.length ?? 0 },
    { id: 'images', label: 'Images', count: data?.images.length ?? 0 },
    { id: 'networks', label: 'Networks', count: data?.networks.length ?? 0 },
    { id: 'volumes', label: 'Volumes', count: data?.volumes.length ?? 0 },
  ];

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-white', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        <div className="mr-auto">
          <div className="text-xs font-semibold text-slate-800">Docker objects</div>
          <div className="text-[10px] text-slate-500">
            Read-only snapshot from the daemon inside this lab
          </div>
        </div>
        <span className="text-[10px] text-slate-400">
          {data ? `Captured ${new Date(data.capturedAt).toLocaleTimeString()}` : 'Waiting…'}
        </span>
        <button
          type="button"
          onClick={refresh}
          className="vlab-button-secondary px-2.5 py-1 text-[10px]"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={refresh}
            className="rounded border border-rose-300 bg-white px-2 py-1 text-[10px] font-medium text-rose-700"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 pt-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-t border border-b-0 px-2.5 py-1.5 text-[11px] font-medium',
              tab === entry.id
                ? 'border-slate-200 bg-white text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {entry.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px]',
                tab === entry.id ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-slate-500',
              )}
            >
              {entry.count}
            </span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!data && !error && (
          <div className="grid h-full min-h-40 place-items-center text-xs text-slate-500">
            Reading Docker objects…
          </div>
        )}

        {data && tab === 'containers' && (
          data.containers.length === 0 ? (
            <Empty>No containers yet. Run one from the terminal.</Empty>
          ) : (
            <table className="min-w-full text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Image</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Ports</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.containers.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{row.name || '(unnamed)'}</div>
                      <div className="font-mono text-[9px] text-slate-400">{shortId(row.id)}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-600">{row.image}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize',
                          stateTone(row.state),
                        )}
                      >
                        {row.state || 'unknown'}
                      </span>
                    </td>
                    <td className="max-w-48 px-3 py-2 font-mono text-[10px] text-slate-600">
                      {row.ports || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {data && tab === 'images' && (
          data.images.length === 0 ? (
            <Empty>No images yet. Build or pull one from the terminal.</Empty>
          ) : (
            <table className="min-w-full text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Repository</th>
                  <th className="px-3 py-2 font-medium">Tag</th>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.images.map((row) => (
                  <tr key={`${row.id}-${row.repository}-${row.tag}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-700">
                      {row.repository || '(none)'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-600">
                      {row.tag || '(none)'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                      {shortId(row.id)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.size || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.createdSince || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {data && tab === 'networks' && (
          data.networks.length === 0 ? (
            <Empty>No networks yet. Create one from the terminal.</Empty>
          ) : (
            <table className="min-w-full text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 font-medium">Scope</th>
                  <th className="px-3 py-2 font-medium">ID</th>
                </tr>
              </thead>
              <tbody>
                {data.networks.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                    <td className="px-3 py-2 text-slate-600">{row.driver || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.scope || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                      {shortId(row.id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {data && tab === 'volumes' && (
          data.volumes.length === 0 ? (
            <Empty>No volumes yet. Create one from the terminal.</Empty>
          ) : (
            <table className="min-w-full text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 font-medium">Mountpoint</th>
                </tr>
              </thead>
              <tbody>
                {data.volumes.map((row) => (
                  <tr key={row.name} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                    <td className="px-3 py-2 text-slate-600">{row.driver || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                      {row.mountpoint || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      <div className="border-t border-slate-200 px-3 py-1.5 text-[10px] text-slate-400">
        Read-only inventory · use the terminal for Docker commands
      </div>
    </div>
  );
}
