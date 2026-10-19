#!/bin/sh
set -e

echo "[vlab] waiting for the Docker socket"
i=0
while [ ! -S /var/run/docker.sock ] && [ "$i" -lt 30 ]; do
  i=$((i + 1))
  sleep 1
done

echo "[vlab] applying database schema"
npx prisma db push --skip-generate

echo "[vlab] seeding demo data (idempotent)"
npx tsx prisma/seed.ts

echo "[vlab] starting API"
exec "$@"
