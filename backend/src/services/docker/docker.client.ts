import Docker from 'dockerode';
import type { Duplex } from 'node:stream';
import { config } from '../../config.js';

/**
 * Docker connection.
 *
 * Inside the compose network the backend talks to the host daemon through the
 * mounted /var/run/docker.sock. When running natively on Windows (spike, smoke
 * tests) the same code points at Docker Desktop's named pipe instead, because
 * Docker Desktop does not expose a unix socket to the Windows filesystem.
 */
function buildDocker(): Docker {
  const sock = config.dockerSocket;
  if (sock.startsWith('npipe://')) {
    // npipe:////./pipe/dockerDesktopLinuxEngine -> //./pipe/dockerDesktopLinuxEngine
    return new Docker({ socketPath: sock.replace(/^npipe:\/+/, '//') });
  }
  return new Docker({ socketPath: sock });
}

export const docker = buildDocker();

export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function collector() {
  const chunks: Buffer[] = [];
  return {
    stream: {
      write(chunk: Buffer) {
        chunks.push(Buffer.from(chunk));
        return true;
      },
    },
    text: () => Buffer.concat(chunks).toString('utf8'),
  };
}

/**
 * Run a command in an already-running container and capture the result.
 *
 * Uses a non-TTY exec so docker multiplexes stdout/stderr into separate
 * frames, which demuxStream splits back apart. A TTY exec would merge both
 * streams and make output comparison unreliable.
 */
export async function execInContainer(
  containerId: string,
  cmd: string[],
  options: { workdir?: string; timeoutMs?: number; env?: string[] } = {},
): Promise<ExecResult> {
  const container = docker.getContainer(containerId);
  const timeoutMs = options.timeoutMs ?? config.checkTimeoutSeconds * 1000;

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    AttachStdin: false,
    Tty: false,
    WorkingDir: options.workdir,
    Env: options.env,
  });

  const stream = (await exec.start({ hijack: false, stdin: false })) as unknown as Duplex;
  const out = collector();
  const err = collector();
  docker.modem.demuxStream(stream as never, out.stream as never, err.stream as never);

  const timedOut = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      stream.destroy();
      resolve(true);
    }, timeoutMs);
    stream.on('end', () => {
      clearTimeout(timer);
      resolve(false);
    });
    stream.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });

  let exitCode: number | null = null;
  try {
    const info = await exec.inspect();
    exitCode = info.ExitCode ?? null;
  } catch {
    exitCode = null;
  }

  return { exitCode, stdout: out.text(), stderr: err.text(), timedOut };
}

/**
 * Open an interactive TTY exec and return the raw duplex stream.
 * Used by the terminal WebSocket: the stream is kept open and shared by every
 * attached client (the owner typing, the teacher watching).
 */
export async function startTtyExec(
  containerId: string,
  options: { workdir?: string; cols?: number; rows?: number } = {},
) {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['bash', '--rcfile', '/etc/vlab/bashrc', '-i'],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    WorkingDir: options.workdir ?? '/root',
    Env: ['TERM=xterm-256color'],
  });

  const stream = (await exec.start({ hijack: true, stdin: true })) as unknown as Duplex;

  if (options.cols && options.rows) {
    await exec.resize({ w: options.cols, h: options.rows }).catch(() => undefined);
  }

  return { exec, stream };
}
