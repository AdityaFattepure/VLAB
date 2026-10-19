import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type Role = 'teacher' | 'student';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
  );
}

export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  return {
    id: String(payload.sub ?? ''),
    name: String(payload.name ?? ''),
    email: String(payload.email ?? ''),
    role: payload.role === 'teacher' ? 'teacher' : 'student',
  };
}
