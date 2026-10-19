import { cleanupIdleSessions } from '../services/session.service.js';

export function startCleanupJob(): () => void {
  const timer = setInterval(
    () => {
      void cleanupIdleSessions();
    },
    5 * 60 * 1000,
  );
  timer.unref();
  return () => clearInterval(timer);
}
