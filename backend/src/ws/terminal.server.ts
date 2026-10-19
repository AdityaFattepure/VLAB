import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { verifyToken, type AuthUser } from '../lib/jwt.js';
import { loadSessionForUser } from '../services/session.service.js';
import { attachClient, handleClientMessage } from './attach.manager.js';

function reject(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/**
 * Terminal transport.
 *
 * The JWT travels as a query parameter because browsers cannot set headers on
 * a WebSocket handshake. Authorization is checked against the session before
 * the upgrade completes, so a student cannot attach to another student's lab.
 */
export function attachTerminalServer(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/ws/terminal') {
        reject(socket, '404 Not Found');
        return;
      }

      const token = url.searchParams.get('token');
      const sessionId = url.searchParams.get('sessionId');
      if (!token || !sessionId) {
        reject(socket, '401 Unauthorized');
        return;
      }

      let user: AuthUser;
      try {
        user = verifyToken(token);
      } catch {
        reject(socket, '401 Unauthorized');
        return;
      }

      try {
        await loadSessionForUser(sessionId, user);
      } catch {
        reject(socket, '403 Forbidden');
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        void startClient(ws, sessionId, user.role);
      });
    })().catch(() => reject(socket, '500 Internal Server Error'));
  });
}

async function startClient(ws: WebSocket, sessionId: string, role: 'teacher' | 'student'): Promise<void> {
  try {
    await attachClient(sessionId, ws, role, 100, 30);
    ws.send(JSON.stringify({ type: 'ready', role }));
  } catch (err) {
    ws.send(
      JSON.stringify({
        type: 'error',
        error: err instanceof Error ? err.message : 'Could not attach to the terminal',
      }),
    );
    ws.close();
    return;
  }

  ws.on('message', (raw) => handleClientMessage(sessionId, ws, raw.toString()));
}
