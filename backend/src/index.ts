import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { startCheckerJob } from './jobs/checker.job.js';
import { startCleanupJob } from './jobs/cleanup.job.js';
import { prisma } from './prisma.js';
import { resumeCommandTails } from './services/commandlog.service.js';
import { reconcileOnBoot } from './services/session.service.js';
import { attachTerminalServer } from './ws/terminal.server.js';

const app = createApp();
const server = http.createServer(app);
attachTerminalServer(server);

server.listen(config.port, () => {
  console.log(`VLab API listening on :${config.port}`);
});

const stopChecker = startCheckerJob();
const stopCleanup = startCleanupJob();

void (async () => {
  try {
    await reconcileOnBoot();
    await resumeCommandTails();
    console.log('[boot] docker state reconciled, command tails resumed');
  } catch (err) {
    console.error('[boot] reconciliation failed:', err);
  }
})();

async function shutdown(signal: string) {
  console.log(`[shutdown] ${signal}`);
  stopChecker();
  stopCleanup();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
