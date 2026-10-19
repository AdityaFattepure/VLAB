import { forbidden, notFound } from '../lib/errors.js';
import { prisma } from '../prisma.js';

export async function requireOwnedClass(classId: string, teacherId: string) {
  const klass = await prisma.class.findUnique({ where: { id: classId } });
  if (!klass) notFound('Class not found');
  if (klass.teacherId !== teacherId) forbidden('Not your class');
  return klass;
}

export async function requireOwnedLab(labId: string, teacherId: string) {
  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) notFound('Lab not found');
  if (lab.createdBy !== teacherId) forbidden('Not your lab');
  return lab;
}

export async function requireOwnedTask(taskId: string, teacherId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { lab: true } });
  if (!task) notFound('Task not found');
  if (task.lab.createdBy !== teacherId) forbidden('Not your task');
  return task;
}
