import 'dotenv/config';
import path from 'node:path';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() !== '' ? raw.trim() : fallback;
}

export const config = {
  port: num('PORT', 3000),
  databaseUrl: str('DATABASE_URL', 'file:./dev.db'),
  jwtSecret: str('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: str('JWT_EXPIRES_IN', '7d'),

  dockerSocket: str('DOCKER_SOCKET', '/var/run/docker.sock'),
  images: {
    'linux-basic': str('VLAB_IMAGE_LINUX_BASIC', 'vlab/linux-basic:latest'),
    'docker-dind': str('VLAB_IMAGE_DOCKER_DIND', 'vlab/docker-dind:latest'),
  },
  dindMemoryMb: num('DIND_MEMORY_MB', 1024),
  basicMemoryMb: num('BASIC_MEMORY_MB', 512),
  checkerIntervalSeconds: num('CHECKER_INTERVAL_SECONDS', 30),
  checkTimeoutSeconds: num('CHECK_TIMEOUT_SECONDS', 15),
  sessionIdleMinutes: num('SESSION_IDLE_MINUTES', 30),
  registryMirror: str('REGISTRY_MIRROR', ''),
  uploadsDir: str('UPLOADS_DIR', path.resolve(process.cwd(), 'uploads')),
} as const;

export type LabTemplate = keyof typeof config.images;

export const LAB_TEMPLATES = Object.keys(config.images) as LabTemplate[];

export function isLabTemplate(value: string): value is LabTemplate {
  return (LAB_TEMPLATES as string[]).includes(value);
}
