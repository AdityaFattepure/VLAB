import { Router } from 'express';
import { optInt, optString, param, reqString } from '../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../prisma.js';
import { requireOwnedTask } from '../services/access.service.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth, requireRole('teacher'));

tasksRouter.put('/:id', async (req, res) => {
  const user = currentUser(req);
  await requireOwnedTask(param(req, 'id'), user.id);

  const data: Record<string, unknown> = {};
  if (req.body?.title !== undefined) data.title = reqString(req.body.title, 'Task title', { min: 2, max: 160 });
  if (req.body?.description !== undefined) data.description = optString(req.body.description) ?? '';
  if (req.body?.checkCommand !== undefined) {
    data.checkCommand = reqString(req.body.checkCommand, 'Check command', { min: 1, max: 2000 });
  }
  if (req.body?.expectedOutputContains !== undefined) {
    data.expectedOutputContains = optString(req.body.expectedOutputContains);
  }
  if (req.body?.expectedExitCode !== undefined) {
    data.expectedExitCode = optInt(req.body.expectedExitCode, 0);
  }
  if (req.body?.order !== undefined) data.order = optInt(req.body.order, 1);

  const task = await prisma.task.update({ where: { id: param(req, 'id') }, data });
  res.json(task);
});

tasksRouter.delete('/:id', async (req, res) => {
  const user = currentUser(req);
  await requireOwnedTask(param(req, 'id'), user.id);
  await prisma.task.delete({ where: { id: param(req, 'id') } });
  res.status(204).end();
});
