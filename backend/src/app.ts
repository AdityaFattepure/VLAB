import express from 'express';
import { docker } from './services/docker/docker.client.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.routes.js';
import { classesRouter } from './routes/classes.routes.js';
import { labsRouter } from './routes/labs.routes.js';
import { tasksRouter } from './routes/tasks.routes.js';
import { assignmentsRouter } from './routes/assignments.routes.js';
import { sessionsRouter } from './routes/sessions.routes.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', async (_req, res) => {
    let dockerOk = false;
    try {
      await Promise.race([
        docker.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ]);
      dockerOk = true;
    } catch {
      dockerOk = false;
    }
    res.json({ ok: true, docker: dockerOk, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/classes', classesRouter);
  app.use('/api/labs', labsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/sessions', sessionsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);
  return app;
}
