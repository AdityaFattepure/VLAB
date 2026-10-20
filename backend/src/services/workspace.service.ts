import {
  HttpError,
  badGateway,
  badRequest,
  conflict,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
} from '../lib/errors.js';
import {
  MAX_EDITOR_FILE_BYTES,
  WORKSPACE_ROOT,
  isBinaryText,
  normaliseWorkspacePath,
  parseFileStatLines,
  parseJsonLines,
  type WorkspaceFileEntry,
} from '../lib/workspace.logic.js';
import { execInContainer, type ExecResult } from './docker/docker.client.js';

const MAX_DOCKER_ROWS = 200;
const COMMAND_TIMEOUT_MS = 8000;

export interface DockerContainerRow {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  createdAt: string;
  runningFor: string;
  command: string;
}

export interface DockerImageRow {
  id: string;
  repository: string;
  tag: string;
  size: string;
  createdSince: string;
}

export interface DockerNetworkRow {
  id: string;
  name: string;
  driver: string;
  scope: string;
}

export interface DockerVolumeRow {
  name: string;
  driver: string;
  mountpoint: string;
}

export interface DockerInventory {
  capturedAt: string;
  containers: DockerContainerRow[];
  images: DockerImageRow[];
  networks: DockerNetworkRow[];
  volumes: DockerVolumeRow[];
}

function outputText(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function commandFailure(result: ExecResult, fallback: string): never {
  if (result.timedOut) {
    throw new HttpError(504, 'The lab command timed out');
  }
  const detail = result.stderr.trim().replace(/\s+/g, ' ').slice(0, 240);
  throw new HttpError(400, detail ? `${fallback}: ${detail}` : fallback);
}

async function runInLab(
  containerId: string,
  script: string,
  args: string[],
): Promise<ExecResult> {
  return execInContainer(containerId, ['sh', '-c', script, 'vlab', ...args], {
    timeoutMs: COMMAND_TIMEOUT_MS,
  });
}

export async function listWorkspaceFiles(
  containerId: string,
  requestedPath: string,
): Promise<{ path: string; entries: WorkspaceFileEntry[] }> {
  const dir = normaliseWorkspacePath(requestedPath);
  const result = await runInLab(
    containerId,
    `set -eu
if [ ! -e "$1" ]; then
  echo "Path not found" >&2
  exit 3
fi
if [ ! -d "$1" ]; then
  echo "Not a directory" >&2
  exit 4
fi
find "$1" -mindepth 1 -maxdepth 1 -exec stat -c '%F\t%s\t%n' {} \\;`,
    [dir],
  );

  if (result.timedOut) throw new HttpError(504, 'The lab command timed out');
  if (result.exitCode === 3) notFound('Directory not found');
  if (result.exitCode === 4) badRequest('That path is not a directory');
  if (result.exitCode !== 0) commandFailure(result, 'Could not list the workspace');

  return { path: dir, entries: parseFileStatLines(result.stdout) };
}

export async function readWorkspaceFile(
  containerId: string,
  requestedPath: string,
): Promise<{ path: string; content: string; size: number; binary: boolean }> {
  const filePath = normaliseWorkspacePath(requestedPath);
  const result = await runInLab(
    containerId,
    `set -eu
if [ ! -f "$1" ]; then
  echo "File not found" >&2
  exit 3
fi
size=$(wc -c < "$1")
if [ "$size" -gt ${MAX_EDITOR_FILE_BYTES} ]; then
  echo "File is too large" >&2
  exit 2
fi
cat "$1"`,
    [filePath],
  );

  if (result.timedOut) throw new HttpError(504, 'The lab command timed out');
  if (result.exitCode === 3) notFound('File not found');
  if (result.exitCode === 2) {
    payloadTooLarge(`Files larger than ${MAX_EDITOR_FILE_BYTES} bytes cannot be opened`);
  }
  if (result.exitCode !== 0) commandFailure(result, 'Could not read the file');
  if (isBinaryText(result.stdout)) {
    unsupportedMediaType('Binary files cannot be opened in the editor');
  }

  return {
    path: filePath,
    content: result.stdout,
    size: Buffer.byteLength(result.stdout, 'utf8'),
    binary: false,
  };
}

export async function writeWorkspaceFile(
  containerId: string,
  requestedPath: string,
  content: string,
): Promise<{ path: string; size: number; savedAt: string }> {
  const filePath = normaliseWorkspacePath(requestedPath);
  if (filePath === WORKSPACE_ROOT) {
    badRequest('Choose a file path, not the workspace root');
  }

  const size = Buffer.byteLength(content, 'utf8');
  if (size > MAX_EDITOR_FILE_BYTES) {
    payloadTooLarge(`Files are limited to ${MAX_EDITOR_FILE_BYTES} bytes`);
  }
  if (content.includes('\0')) {
    badRequest('Content cannot contain NUL bytes');
  }

  const result = await runInLab(
    containerId,
    `set -eu
if [ -d "$1" ]; then
  echo "A directory already exists at that path" >&2
  exit 5
fi
mkdir -p "$(dirname "$1")"
printf '%s' "$2" > "$1"`,
    [filePath, content],
  );

  if (result.timedOut) throw new HttpError(504, 'The lab command timed out');
  if (result.exitCode === 5) conflict('A directory already exists at that path');
  if (result.exitCode !== 0) commandFailure(result, 'Could not save the file');

  return { path: filePath, size, savedAt: new Date().toISOString() };
}

function dockerName(value: string): string {
  return value.replace(/^\//, '');
}

async function dockerRows(
  containerId: string,
  args: string[],
  label: string,
): Promise<Record<string, unknown>[]> {
  const result = await execInContainer(containerId, args, {
    timeoutMs: COMMAND_TIMEOUT_MS,
  });

  if (result.timedOut) {
    console.error(`[workspace] ${label} timed out`);
    badGateway('The Docker daemon inside the lab did not respond');
  }
  if (result.exitCode !== 0) {
    console.error(`[workspace] ${label} failed: ${result.stderr.trim().slice(0, 500)}`);
    badGateway('Could not read Docker objects from the lab');
  }

  return parseJsonLines(result.stdout).slice(0, MAX_DOCKER_ROWS);
}

/**
 * Read the inner Docker daemon's read-only inventory. No request value is
 * passed to Docker; the command list is fixed here.
 */
export async function readDockerInventory(containerId: string): Promise<DockerInventory> {
  const [containers, images, networks, volumes] = await Promise.all([
    dockerRows(
      containerId,
      ['docker', 'ps', '-a', '--no-trunc', '--format', '{{json .}}'],
      'docker ps',
    ),
    dockerRows(
      containerId,
      ['docker', 'images', '--no-trunc', '--format', '{{json .}}'],
      'docker images',
    ),
    dockerRows(
      containerId,
      ['docker', 'network', 'ls', '--no-trunc', '--format', '{{json .}}'],
      'docker network ls',
    ),
    dockerRows(
      containerId,
      ['docker', 'volume', 'ls', '--format', '{{json .}}'],
      'docker volume ls',
    ),
  ]);

  return {
    capturedAt: new Date().toISOString(),
    containers: containers.map((row) => ({
      id: outputText(row, 'ID'),
      name: dockerName(outputText(row, 'Names')),
      image: outputText(row, 'Image'),
      state: outputText(row, 'State'),
      status: outputText(row, 'Status'),
      ports: outputText(row, 'Ports'),
      createdAt: outputText(row, 'CreatedAt'),
      runningFor: outputText(row, 'RunningFor'),
      command: outputText(row, 'Command'),
    })),
    images: images.map((row) => ({
      id: outputText(row, 'ID'),
      repository: outputText(row, 'Repository'),
      tag: outputText(row, 'Tag'),
      size: outputText(row, 'Size'),
      createdSince: outputText(row, 'CreatedSince'),
    })),
    networks: networks.map((row) => ({
      id: outputText(row, 'ID'),
      name: outputText(row, 'Name'),
      driver: outputText(row, 'Driver'),
      scope: outputText(row, 'Scope'),
    })),
    volumes: volumes.map((row) => ({
      name: outputText(row, 'Name'),
      driver: outputText(row, 'Driver'),
      mountpoint: outputText(row, 'Mountpoint'),
    })),
  };
}
