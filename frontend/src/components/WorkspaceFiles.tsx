import { useEffect, useState } from 'react';
import type { WorkspaceFileContent, WorkspaceListing } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../lib/format';
import { CodeEditor } from './CodeEditor';

function parentPath(value: string): string {
  if (value === '/root') return '/root';
  const parts = value.split('/').filter(Boolean);
  parts.pop();
  return parts.length === 0 ? '/root' : `/${parts.join('/')}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function targetPath(currentDir: string, entered: string): string {
  if (entered.startsWith('/')) return entered;
  return `${currentDir === '/' ? '' : currentDir}/${entered}`.replace(/\/+/g, '/');
}

export function WorkspaceFiles({
  sessionId,
  readOnly = false,
  className,
}: {
  sessionId: string;
  readOnly?: boolean;
  className?: string;
}) {
  const { api } = useAuth();
  const [dir, setDir] = useState('/root');
  const [listing, setListing] = useState<WorkspaceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState('');

  const dirty = filePath !== null && content !== savedContent;

  useEffect(() => {
    let active = true;
    setDir('/root');
    setListing(null);
    setFilePath(null);
    setContent('');
    setSavedContent('');
    setError(null);
    setNotice('');
    setCreating(false);
    setLoading(true);

    api<WorkspaceListing>(`/sessions/${sessionId}/files?path=/root`)
      .then((data) => {
        if (!active) return;
        setListing(data);
        setDir(data.path);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load the workspace');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, sessionId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function openDirectory(path: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await api<WorkspaceListing>(
        `/sessions/${sessionId}/files?path=${encodeURIComponent(path)}`,
      );
      setListing(data);
      setDir(data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that folder');
    } finally {
      setLoading(false);
    }
  }

  async function openFile(path: string) {
    if (path === filePath) return;
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;

    setLoadingFile(true);
    setError(null);
    setNotice('');
    try {
      const data = await api<WorkspaceFileContent>(
        `/sessions/${sessionId}/files/content?path=${encodeURIComponent(path)}`,
      );
      setFilePath(data.path);
      setContent(data.content);
      setSavedContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that file');
    } finally {
      setLoadingFile(false);
    }
  }

  async function refreshCurrentDirectory() {
    const data = await api<WorkspaceListing>(
      `/sessions/${sessionId}/files?path=${encodeURIComponent(dir)}`,
    );
    setListing(data);
    setDir(data.path);
  }

  async function save() {
    if (readOnly || !filePath || saving) return;
    setSaving(true);
    setError(null);
    setNotice('');
    try {
      const saved = await api<{ path: string; size: number; savedAt: string }>(
        `/sessions/${sessionId}/files/content`,
        {
          method: 'PUT',
          body: { path: filePath, content },
        },
      );
      setFilePath(saved.path);
      setSavedContent(content);
      setNotice(`Saved ${formatSize(saved.size)}`);
      await refreshCurrentDirectory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the file');
    } finally {
      setSaving(false);
    }
  }

  function startCreating() {
    setCreating(true);
    setNewPath('');
    setNotice('');
    setError(null);
  }

  function createFile() {
    const entered = newPath.trim();
    if (!entered) {
      setError('Enter a file path');
      return;
    }
    const path = targetPath(dir, entered);
    setFilePath(path);
    setContent('');
    setSavedContent('');
    setCreating(false);
    setNewPath('');
    setNotice('New buffer ready — press Save to create the file');
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!readOnly && dirty) void save();
    }
  }

  const segments = dir.split('/').filter(Boolean);

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col bg-white', className)}
      onKeyDown={handleKeyDown}
    >
      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex max-h-56 shrink-0 flex-col border-b border-slate-200 bg-slate-50/70 md:max-h-none md:w-56 md:border-b-0 md:border-r">
          <div className="border-b border-slate-200 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Workspace
              </span>
              <button
                type="button"
                onClick={() => void openDirectory(parentPath(dir))}
                disabled={dir === '/root' || loading}
                className="vlab-button-quiet px-1.5 py-1 text-[10px]"
                title="Go up one folder"
              >
                Up
              </button>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-slate-500" title={dir}>
              {dir}
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={startCreating}
                className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              >
                New file
              </button>
            )}
          </div>

          {creating && !readOnly && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                createFile();
              }}
              className="border-b border-slate-200 bg-white px-3 py-2"
            >
              <label htmlFor="new-workspace-file" className="text-[10px] text-slate-500">
                Path from {dir}
              </label>
              <input
                id="new-workspace-file"
                autoFocus
                value={newPath}
                onChange={(event) => setNewPath(event.target.value)}
                placeholder="hello-world/index.html"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-[11px] text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-1.5 flex gap-1">
                <button type="submit" className="vlab-button-primary px-2 py-1 text-[10px]">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="vlab-button-secondary px-2 py-1 text-[10px]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {loading && (
              <div className="px-2 py-4 text-center text-[11px] text-slate-500">Loading…</div>
            )}
            {!loading && listing?.entries.length === 0 && (
              <div className="px-2 py-4 text-center text-[11px] text-slate-500">
                This folder is empty.
              </div>
            )}
            {!loading &&
              listing?.entries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() =>
                    entry.type === 'directory'
                      ? void openDirectory(entry.path)
                      : void openFile(entry.path)
                  }
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px]',
                    filePath === entry.path
                      ? 'bg-[#123a63] text-white'
                      : 'text-slate-700 hover:bg-white hover:text-slate-900',
                  )}
                  title={entry.path}
                >
                  <span
                    className={cn(
                      'w-3 shrink-0 text-center font-mono text-[10px]',
                      filePath === entry.path ? 'text-white/70' : 'text-slate-400',
                    )}
                  >
                    {entry.type === 'directory' ? '▸' : '·'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  {entry.type === 'file' && (
                    <span
                      className={cn(
                        'shrink-0 text-[9px]',
                        filePath === entry.path ? 'text-white/60' : 'text-slate-400',
                      )}
                    >
                      {formatSize(entry.size)}
                    </span>
                  )}
                </button>
              ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[11px] text-slate-500">
              {segments.map((segment, index) => {
                const path = `/${segments.slice(0, index + 1).join('/')}`;
                return (
                  <span key={path} className="flex items-center gap-1">
                    {index > 0 && <span className="text-slate-300">/</span>}
                    <button
                      type="button"
                      onClick={() => void openDirectory(path)}
                      className="truncate hover:text-slate-800"
                    >
                      {segment}
                    </button>
                  </span>
                );
              })}
              {filePath && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="truncate font-mono text-slate-700">
                    {filePath.split('/').pop()}
                  </span>
                </>
              )}
            </div>

            {readOnly ? (
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500">
                Read-only
              </span>
            ) : (
              <>
                <span
                  className={cn(
                    'text-[10px]',
                    dirty ? 'font-medium text-amber-700' : 'text-slate-400',
                  )}
                >
                  {dirty ? 'Unsaved changes' : notice || 'Saved'}
                </span>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!filePath || !dirty || saving}
                  className="vlab-button-primary px-3 py-1 text-[11px]"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>

          <div className="min-h-0 flex-1">
            {loadingFile ? (
              <div className="grid h-full place-items-center text-xs text-slate-500">
                Opening file…
              </div>
            ) : filePath ? (
              <CodeEditor
                key={filePath}
                value={content}
                path={filePath}
                readOnly={readOnly}
                onChange={setContent}
              />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <div className="text-sm font-medium text-slate-700">Select a file to edit</div>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                    Choose a file from the rail, or create a new one. Files are saved inside
                    your lab container under <span className="font-mono">/root</span>.
                  </p>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={startCreating}
                      className="vlab-button-secondary mt-3 px-3 py-1.5 text-xs"
                    >
                      Create a file
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 px-3 py-1.5 text-[10px] text-slate-400">
            {readOnly
              ? 'Teacher view · files are read-only'
              : 'Ctrl/Cmd+S saves · maximum 256 KB per file'}
          </div>
        </section>
      </div>
    </div>
  );
}
