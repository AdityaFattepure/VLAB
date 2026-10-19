#!/bin/sh
# VLab DinD entrypoint.
# Runs the inner docker daemon as the container's main process, waits until it
# is ready, then warms the demo images in the background. Students get their
# shell from `docker exec`, not from this process, so the daemon must outlive
# any single shell.
set -u

export DOCKER_TLS_CERTDIR=""

set -- dockerd --host=unix:///var/run/docker.sock
if [ -n "${VLAB_REGISTRY_MIRROR:-}" ]; then
  # The pull-through cache speaks plain HTTP, so the daemon must trust it.
  mirror_host=${VLAB_REGISTRY_MIRROR#http://}
  mirror_host=${mirror_host#https://}
  mirror_host=${mirror_host%%/*}
  set -- "$@" \
    --registry-mirror="$VLAB_REGISTRY_MIRROR" \
    --insecure-registry="$mirror_host"
fi
"$@" >/var/log/vlab/dockerd.log 2>&1 &
DOCKERD_PID=$!

# Wait for the inner daemon to accept commands (typically 3-10s).
i=0
while [ "$i" -lt 90 ]; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

if ! docker info >/dev/null 2>&1; then
  echo "vlab: inner docker daemon failed to start; see /var/log/vlab/dockerd.log"
  tail -n 20 /var/log/vlab/dockerd.log
fi

# Warm the demo images; never block the shell on this.
(
  docker pull nginx:alpine >/dev/null 2>&1 || true
  docker pull alpine:3.20 >/dev/null 2>&1 || true
) &

wait "$DOCKERD_PID"
