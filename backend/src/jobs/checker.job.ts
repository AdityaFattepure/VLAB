import { config } from '../config.js';
import { checkAllReadySessions } from '../services/checker.service.js';

export function startCheckerJob(): () => void {
  const timer = setInterval(() => {
    void checkAllReadySessions();
  }, config.checkerIntervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
