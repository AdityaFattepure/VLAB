import { describe, expect, it } from 'vitest';
import {
  isBinaryText,
  normaliseWorkspacePath,
  parseFileStatLines,
  parseJsonLines,
  workspaceParent,
} from './workspace.logic.js';

describe('workspace.logic', () => {
  it('normalises relative and absolute paths under /root', () => {
    expect(normaliseWorkspacePath('hello-world/index.html')).toBe('/root/hello-world/index.html');
    expect(normaliseWorkspacePath('/root/./a//b.txt')).toBe('/root/a/b.txt');
    expect(normaliseWorkspacePath('')).toBe('/root');
  });

  it('rejects paths outside /root, traversal, backslashes, and NUL bytes', () => {
    expect(() => normaliseWorkspacePath('/etc/passwd')).toThrow();
    expect(() => normaliseWorkspacePath('/root/../etc/passwd')).toThrow();
    expect(() => normaliseWorkspacePath('..\\secret')).toThrow();
    expect(() => normaliseWorkspacePath('/root/a\0b')).toThrow();
  });

  it('finds parents without escaping the root', () => {
    expect(workspaceParent('/root/a/b.txt')).toBe('/root/a');
    expect(workspaceParent('/root/a')).toBe('/root');
    expect(workspaceParent('/root')).toBe('/root');
  });

  it('parses stat lines into sorted entries', () => {
    const entries = parseFileStatLines(
      'regular file\t24\t/root/z.txt\n' +
        'directory\t4096\t/root/hello-world\n' +
        'regular file\t12\t/root/a.txt\n',
    );
    expect(entries.map((entry) => entry.name)).toEqual(['hello-world', 'a.txt', 'z.txt']);
    expect(entries[0]).toMatchObject({ path: '/root/hello-world', type: 'directory' });
    expect(entries[1]).toMatchObject({ path: '/root/a.txt', size: 12, type: 'file' });
  });

  it('ignores malformed and out-of-root stat lines', () => {
    expect(
      parseFileStatLines('garbage\nregular file\t1\t/etc/passwd\ndirectory\t1\t/root/ok\n'),
    ).toHaveLength(1);
  });

  it('parses newline-delimited JSON and skips blank lines', () => {
    expect(parseJsonLines<{ Names: string }>('{"Names":"a"}\n\n{"Names":"b"}\n')).toEqual([
      { Names: 'a' },
      { Names: 'b' },
    ]);
  });

  it('detects NUL bytes as binary', () => {
    expect(isBinaryText('hello')).toBe(false);
    expect(isBinaryText('hello\u0000world')).toBe(true);
  });
});
