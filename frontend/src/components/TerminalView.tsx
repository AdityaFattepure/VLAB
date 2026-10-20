import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../lib/format';

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

type Connection = 'connecting' | 'connected' | 'closed' | 'error';

export function TerminalView({
  sessionId,
  readOnly = false,
  bare = false,
  className,
}: {
  sessionId: string;
  readOnly?: boolean;
  bare?: boolean;
  className?: string;
}) {
  const { token } = useAuth();
  const hostRef = useRef<HTMLDivElement>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new Terminal({
      cursorBlink: !readOnly,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      scrollback: 3000,
      theme: {
        background: '#020617',
        foreground: '#e2e8f0',
        cursor: '#818cf8',
        selectionBackground: '#3730a3',
        black: '#0f172a',
        brightBlack: '#475569',
        green: '#34d399',
        brightGreen: '#6ee7b7',
        blue: '#60a5fa',
        brightBlue: '#93c5fd',
        red: '#fb7185',
        brightRed: '#fda4af',
        yellow: '#fbbf24',
      },
    });

    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);

    const doFit = () => {
      try {
        fit.fit();
      } catch {
        /* host not laid out yet */
      }
    };
    requestAnimationFrame(doFit);

    const observer = new ResizeObserver(doFit);
    observer.observe(host);

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws/terminal?sessionId=${encodeURIComponent(
      sessionId,
    )}&token=${encodeURIComponent(token ?? '')}`;
    const socket = new WebSocket(url);

    socket.onmessage = (event) => {
      let message: {
        type?: string;
        data?: string;
        error?: string;
      };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (message.type === 'output' && typeof message.data === 'string') {
        terminal.write(decodeBase64(message.data));
      } else if (message.type === 'ready') {
        setConnection('connected');
        setError('');
        doFit();
        if (!readOnly) terminal.focus();
      } else if (message.type === 'exit') {
        setConnection('closed');
        terminal.writeln('\r\n\x1b[33m[session ended]\x1b[0m');
      } else if (message.type === 'error') {
        setConnection('error');
        setError(message.error ?? 'Terminal error');
      }
    };

    socket.onerror = () => {
      setConnection('error');
      setError('Could not connect to the terminal');
    };

    socket.onclose = () => {
      setConnection((current) => (current === 'error' ? current : 'closed'));
    };

    const dataSub = readOnly
      ? null
      : terminal.onData((data) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'input', data: encodeBase64(data) }));
          }
        });

    const resizeSub = terminal.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    const focus = () => terminal.focus();
    host.addEventListener('click', focus);

    return () => {
      observer.disconnect();
      host.removeEventListener('click', focus);
      dataSub?.dispose();
      resizeSub.dispose();
      socket.close();
      terminal.dispose();
    };
  }, [sessionId, readOnly, token, attempt]);

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-col overflow-hidden bg-[#020617]',
        bare ? 'border-0' : 'rounded-xl border border-slate-800',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-slate-800/80 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-400">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            connection === 'connected'
              ? 'bg-emerald-400 vlab-live-dot'
              : connection === 'connecting'
                ? 'bg-amber-400'
                : 'bg-rose-400',
          )}
        />
        <span className="uppercase tracking-wider">
          {readOnly ? 'read-only view' : 'student terminal'}
        </span>
        <span className="ml-auto font-mono text-slate-500">{connection}</span>
        {(connection === 'closed' || connection === 'error') && (
          <button
            type="button"
            onClick={() => {
              setConnection('connecting');
              setError('');
              setAttempt((n) => n + 1);
            }}
            className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 hover:border-slate-500"
          >
            Reconnect
          </button>
        )}
      </div>

      <div ref={hostRef} className="min-h-0 flex-1 p-2" />

      {connection !== 'connected' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/40">
          <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-2 text-xs text-slate-300">
            {connection === 'connecting' && 'Connecting to container…'}
            {connection === 'closed' && 'Terminal disconnected — reconnect to continue'}
            {connection === 'error' && (error || 'Terminal error')}
          </div>
        </div>
      )}
    </div>
  );
}
