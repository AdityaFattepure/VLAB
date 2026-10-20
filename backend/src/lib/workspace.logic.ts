import path from 'node:path';
import { HttpError } from './errors.js';

export const WORKSPACE_ROOT = '/root';
export const MAX_EDITOR_FILE_BYTES = 256 * 1024;
const MAX_PATH_LENGTH = 512;

export interface WorkspaceFileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
}

function isInsideRoot(candidate: string): boolean {
  return candidate === WORKSPACE_ROOT || candidate.startsWith(`${WORKSPACE_ROOT}/`);
}

/**
 * Resolve a user-entered workspace path and make sure it cannot leave /root.
 * The check is deliberately lexical: the container is the sandbox, and the
 * shell command receives the final value as an argument, never as script text.
 */
export function normaliseWorkspacePath(
  raw: string | null | undefined,
  fallback: string = WORKSPACE_ROOT,
): string {
  const value = (raw ?? '').trim();
  const candidate = value === '' ? fallback : value;

  if (candidate.includes('\0')) {
    throw new HttpError(400, 'Path cannot contain NUL bytes');
  }
  if (candidate.includes('\\')) {
    throw new HttpError(400, 'Use forward slashes in workspace paths');
  }
  if (candidate.length > MAX_PATH_LENGTH) {
    throw new HttpError(400, `Path must be at most ${MAX_PATH_LENGTH} characters`);
  }

  const absolute = candidate.startsWith('/')
    ? candidate
    : path.posix.join(WORKSPACE_ROOT, candidate);
  const normalised = path.posix.normalize(absolute);

  if (!isInsideRoot(normalised)) {
    throw new HttpError(400, 'Path must stay inside /root');
  }

  return normalised;
}

export function workspaceParent(value: string): string {
  const normalised = normaliseWorkspacePath(value);
  if (normalised === WORKSPACE_ROOT) return WORKSPACE_ROOT;
  const parent = path.posix.dirname(normalised);
  return isInsideRoot(parent) ? parent : WORKSPACE_ROOT;
}

function statType(raw: string): 'file' | 'directory' | null {
  if (raw === 'directory') return 'directory';
  if (raw === 'regular file' || raw === 'symbolic link' || raw === 'block special file' || raw === 'character special file' || raw === 'fifo' || raw === 'socket') {
    return 'file';
  }
  return null;
}

/**
 * BusyBox stat is available in the lab image, so one find produces the whole
 * listing. Lines that do not match the expected tab-separated shape are
 * ignored rather than failing the whole directory view.
 */
export function parseFileStatLines(stdout: string): WorkspaceFileEntry[] {
  const entries: WorkspaceFileEntry[] = [];

  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const first = line.indexOf('\t');
    if (first < 0) continue;
    const second = line.indexOf('\t', first + 1);
    if (second < 0) continue;

    const type = statType(line.slice(0, first).trim());
    if (!type) continue;

    const size = Number(line.slice(first + 1, second));
    if (!Number.isFinite(size) || size < 0) continue;

    const fullPath = line.slice(second + 1).trim();
    if (!fullPath.startsWith(`${WORKSPACE_ROOT}/`) || fullPath.endsWith('/')) continue;

    entries.push({
      name: path.posix.basename(fullPath),
      path: fullPath,
      type,
      size: Math.trunc(size),
    });
  }

  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/**
 * Docker's --format '{{json .}}' emits one object per line. Invalid or
 * non-object lines are treated as absent rather than crashing the panel.
 */
export function parseJsonLines<T = Record<string, unknown>>(stdout: string): T[] {
  const rows: T[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        rows.push(parsed as T);
      }
    } catch {
      /* ignore malformed output */
    }
  }
  return rows;
}

export function isBinaryText(content: string): boolean {
  return content.includes('\0');
}
