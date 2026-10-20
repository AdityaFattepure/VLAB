import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { HttpError } from '../lib/errors.js';
import { reqString } from '../lib/validate.js';
import { isEmail, isUserRole, normalizeEmail } from '../lib/auth.logic.js';
import { signToken, type AuthUser } from '../lib/jwt.js';
import { currentUser, requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const email = normalizeEmail(reqString(req.body?.email, 'Email'));
  const password = reqString(req.body?.password, 'Password');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const authUser: AuthUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === 'teacher' ? 'teacher' : 'student',
  };

  res.json({ token: signToken(authUser), user: authUser });
});

authRouter.post('/register', async (req, res) => {
  const name = reqString(req.body?.name, 'Name', { min: 2, max: 80 });
  const email = normalizeEmail(reqString(req.body?.email, 'Email'));
  const password = reqString(req.body?.password, 'Password', { min: 6, max: 100 });
  const requestedRole = req.body?.role ?? 'student';

  if (!isUserRole(requestedRole)) {
    throw new HttpError(400, 'Choose whether this is a student or teacher account');
  }
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: requestedRole,
    },
  });

  const authUser: AuthUser = { id: user.id, name: user.name, email: user.email, role: requestedRole };
  res.status(201).json({ token: signToken(authUser), user: authUser });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const me = currentUser(req);
  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) {
    res.status(401).json({ error: 'Account no longer exists' });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === 'teacher' ? 'teacher' : 'student',
  });
});
