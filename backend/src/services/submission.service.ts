import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { safeFileName } from '../lib/submission.logic.js';

function stripDataUrl(data: string): string {
  if (!data.startsWith('data:')) return data;
  const comma = data.indexOf(',');
  return comma >= 0 ? data.slice(comma + 1) : data;
}

export interface StoredSubmissionFile {
  relativePath: string;
  absolutePath: string;
}

export async function storeSubmissionFile(
  submissionId: string,
  input: { dataBase64: string; fileName: string },
): Promise<StoredSubmissionFile> {
  const directory = path.join(config.uploadsDir, 'submissions', submissionId);
  await mkdir(directory, { recursive: true });

  const name = `${Date.now()}-${safeFileName(input.fileName)}`;
  const absolutePath = path.join(directory, name);
  await writeFile(absolutePath, Buffer.from(stripDataUrl(input.dataBase64), 'base64'));

  return {
    relativePath: path.relative(config.uploadsDir, absolutePath).split(path.sep).join('/'),
    absolutePath,
  };
}

export function resolveSubmissionFile(relativePath: string): string {
  const root = path.resolve(config.uploadsDir);
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid submission path');
  }
  return absolutePath;
}

export async function removeSubmissionFile(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  try {
    await unlink(resolveSubmissionFile(relativePath));
  } catch {
    /* already gone */
  }
}
