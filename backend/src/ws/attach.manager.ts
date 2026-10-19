import type { Duplex } from 'node:stream';
import type { Exec } from 'dockerode';
import type { WebSocket } from 'ws';
import { prisma } from '../prisma.js';
import { startTtyExec } from '../services/docker/docker.client.js';

export interface ClientMessage {
  type: 'input' | 'resize';
  data?: string; // base64 for input
  cols?: number;
  rows?: number;
}

interface Client {
  ws: WebSocket;
  role: 'teacher' | 'student';
}

interface Attached {
  exec: Exec;
  stream: Duplex;
  clients: Set<Client>;
  scrollback: string;
}

const attached = new Map<string, Attached>();
const attaching = new Map<string, Promise<Attached>>();

async function getOrCreate(sessionId: string, cols: number, rows: number): Promise<Attached> {
  const current = attached.get(sessionId);
  if (current) return current;

  const pending = attaching.get(sessionId);
  if (pending) return pending;

  const promise = (async () => {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session?.containerId) throw new Error('Session has no container');
    if (session.status !== 'ready') throw new Error('Session is not ready');

    const { exec, stream } = await startTtyExec(session.containerId, { cols, rows });
    const state: Attached = { exec, stream, clients: new Set(), scrollback: '' };

    stream.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      // Keep enough recent output that a teacher joining late sees context.
      state.scrollback = (state.scrollback + text).slice(-64_000);
      const payload = JSON.stringify({ type: 'output', data: chunk.toString('base64') });
      for (const client of state.clients) {
        if (client.ws.readyState === 1) client.ws.send(payload);
      }
    });

    const finish = () => {
      for (const client of state.clients) {
        if (client.ws.readyState === 1) client.ws.send(JSON.stringify({ type: 'exit' }));
      }
      attached.delete(sessionId);
    };
    stream.on('close', finish);
    stream.on('error', finish);

    attached.set(sessionId, state);
    return state;
  })().finally(() => attaching.delete(sessionId));

  attaching.set(sessionId, promise);
  return promise;
}

export async function attachClient(
  sessionId: string,
  ws: WebSocket,
  role: 'teacher' | 'student',
  cols: number,
  rows: number,
): Promise<void> {
  const state = await getOrCreate(sessionId, cols, rows);
  const client: Client = { ws, role };
  state.clients.add(client);

  if (state.scrollback) {
    ws.send(
      JSON.stringify({ type: 'output', data: Buffer.from(state.scrollback, 'utf8').toString('base64') }),
    );
  }

  ws.on('close', () => {
    state.clients.delete(client);
  });
}

/**
 * The student's keystrokes drive the shared shell. A teacher attached to the
 * same session is read-only, enforced here on the server rather than in the UI.
 */
export function handleClientMessage(sessionId: string, ws: WebSocket, raw: string): void {
  const state = attached.get(sessionId);
  if (!state) return;

  let message: ClientMessage;
  try {
    message = JSON.parse(raw) as ClientMessage;
  } catch {
    return;
  }

  const client = [...state.clients].find((c) => c.ws === ws);
  if (!client || client.role !== 'student') return;

  if (message.type === 'input' && typeof message.data === 'string') {
    state.stream.write(Buffer.from(message.data, 'base64'));
    return;
  }

  if (message.type === 'resize' && message.cols && message.rows) {
    state.exec.resize({ w: message.cols, h: message.rows }).catch(() => undefined);
  }
}

export function detachSession(sessionId: string): void {
  const state = attached.get(sessionId);
  if (!state) return;
  for (const client of state.clients) {
    if (client.ws.readyState === 1) client.ws.send(JSON.stringify({ type: 'exit' }));
  }
  state.clients.clear();
  state.stream.destroy();
  attached.delete(sessionId);
}
