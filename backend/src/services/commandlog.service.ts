import { Writable } from 'node:stream';
import type { Duplex } from 'node:stream';
import type { Exec } from 'dockerode';
import { prisma } from '../prisma.js';
import { docker } from './docker/docker.client.js';

interface Tail {
  stream: Duplex;
  exec: Exec;
}

const tails = new Map<string, Tail>();

/**
 * Follow the command log written by the lab shell's PROMPT_COMMAND.
 *
 * This is advisory telemetry, not an audit trail: a student can unset
 * PROMPT_COMMAND or run `sh`. The dedupe key on (sessionId, ts, command)
 * lets us safely re-attach after a backend restart without duplicating rows.
 */
export async function startCommandTail(sessionId: string, containerId: string): Promise<void> {
  if (tails.has(sessionId)) return;

  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['tail', '-n', '0', '-F', '/var/log/vlab/commands.log'],
    AttachStdout: true,
    AttachStderr: false,
    Tty: false,
  });

  const stream = (await exec.start({ hijack: false, stdin: false })) as unknown as Duplex;
  tails.set(sessionId, { stream, exec });

  let buffer = '';
  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      buffer += chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) void handleLine(sessionId, line).catch(() => undefined);
        newline = buffer.indexOf('\n');
      }
      cb();
    },
  });

  docker.modem.demuxStream(stream as never, sink, sink);

  const cleanup = () => tails.delete(sessionId);
  stream.on('close', cleanup);
  stream.on('error', cleanup);
}

export function stopCommandTail(sessionId: string): void {
  const tail = tails.get(sessionId);
  if (!tail) return;
  tails.delete(sessionId);
  tail.stream.destroy();
}

async function handleLine(sessionId: string, line: string): Promise<void> {
  const match = /^(\d{10,16})\|(.*)$/.exec(line);
  if (!match) return;

  const raw = match[1];
  const command = match[2];
  if (!raw || !command) return;

  const ms = Number(raw.length > 13 ? raw.slice(0, 13) : raw);
  const ts = new Date(ms);
  if (Number.isNaN(ts.getTime())) return;

  await prisma.commandLog.upsert({
    where: { sessionId_ts_command: { sessionId, ts, command } },
    update: {},
    create: { sessionId, ts, command },
  });

  await prisma.session.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date() },
  });
}

/**
 * After a backend restart the tail streams are gone but the containers are
 * still running. Re-attach so logging resumes.
 */
export async function resumeCommandTails(): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { status: 'ready', containerId: { not: null } },
  });
  for (const session of sessions) {
    if (!session.containerId) continue;
    await startCommandTail(session.id, session.containerId).catch((err) =>
      console.error(`[commandlog] could not resume ${session.id}:`, err.message),
    );
  }
}
