import { Router } from 'express';
import { isLabTemplate } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { optInt, optString, param, reqString } from '../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../prisma.js';
import { requireOwnedLab } from '../services/access.service.js';

export const labsRouter = Router();
labsRouter.use(requireAuth, requireRole('teacher'));

labsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const labs = await prisma.lab.findMany({
    where: { createdBy: user.id },
    orderBy: { createdAt: 'asc' },
    include: {
      tasks: { orderBy: { order: 'asc' } },
      _count: { select: { assignments: true } },
    },
  });

  res.json(
    labs.map((lab) => ({
      id: lab.id,
      title: lab.title,
      description: lab.description,
      template: lab.template,
      taskCount: lab.tasks.length,
      assignmentCount: lab._count.assignments,
      tasks: lab.tasks.map((t) => ({
        id: t.id,
        order: t.order,
        title: t.title,
        description: t.description,
        checkCommand: t.checkCommand,
        expectedOutputContains: t.expectedOutputContains,
        expectedExitCode: t.expectedExitCode,
      })),
    })),
  );
});

labsRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const title = reqString(req.body?.title, 'Title', { min: 2, max: 120 });
  const template = reqString(req.body?.template, 'Template');
  if (!isLabTemplate(template)) throw new HttpError(400, 'Template must be linux-basic or docker-dind');

  const lab = await prisma.lab.create({
    data: {
      title,
      description: optString(req.body?.description) ?? '',
      template,
      createdBy: user.id,
    },
  });
  res.status(201).json(lab);
});

labsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  await requireOwnedLab(param(req, 'id'), user.id);
  const lab = await prisma.lab.findUnique({
    where: { id: param(req, 'id') },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });
  res.json(lab);
});

labsRouter.put('/:id', async (req, res) => {
  const user = currentUser(req);
  await requireOwnedLab(param(req, 'id'), user.id);

  const data: { title?: string; description?: string; template?: string } = {};
  if (req.body?.title !== undefined) data.title = reqString(req.body.title, 'Title', { min: 2, max: 120 });
  if (req.body?.description !== undefined) data.description = optString(req.body.description) ?? '';
  if (req.body?.template !== undefined) {
    const template = reqString(req.body.template, 'Template');
    if (!isLabTemplate(template)) throw new HttpError(400, 'Unknown template');
    data.template = template;
  }

  const lab = await prisma.lab.update({ where: { id: param(req, 'id') }, data });
  res.json(lab);
});

labsRouter.delete('/:id', async (req, res) => {
  const user = currentUser(req);
  await requireOwnedLab(param(req, 'id'), user.id);

  const running = await prisma.session.count({
    where: {
      assignment: { labId: param(req, 'id') },
      status: { in: ['starting', 'ready'] },
    },
  });
  if (running > 0) throw new HttpError(409, 'Stop the running lab sessions before deleting this lab');

  await prisma.lab.delete({ where: { id: param(req, 'id') } });
  res.status(204).end();
});

labsRouter.post('/:id/tasks', async (req, res) => {
  const user = currentUser(req);
  await requireOwnedLab(param(req, 'id'), user.id);

  const title = reqString(req.body?.title, 'Task title', { min: 2, max: 160 });
  const checkCommand = reqString(req.body?.checkCommand, 'Check command', { min: 1, max: 2000 });

  const max = await prisma.task.aggregate({
    where: { labId: param(req, 'id') },
    _max: { order: true },
  });
  const order = optInt(req.body?.order, (max._max.order ?? 0) + 1);

  const task = await prisma.task.create({
    data: {
      labId: param(req, 'id'),
      order,
      title,
      description: optString(req.body?.description) ?? '',
      checkCommand,
      expectedOutputContains: optString(req.body?.expectedOutputContains),
      expectedExitCode: optInt(req.body?.expectedExitCode, 0),
    },
  });
  res.status(201).json(task);
});
