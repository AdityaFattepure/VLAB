/**
 * Spike: prove the risky Docker path before building the app around it.
 *
 * 1. create a privileged DinD container with limits and labels
 * 2. wait for the inner dockerd
 * 3. attach a TTY exec (the terminal path) and run a command through it
 * 4. verify PROMPT_COMMAND wrote the command to the log
 * 5. run a non-TTY check exec and compare the result
 */
import { config } from '../src/config.js';
import { docker, execInContainer, startTtyExec } from '../src/services/docker/docker.client.js';

const NAME = 'vlab-spike-dind';
let failures = 0;

function check(ok: boolean, label: string, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function waitForInnerDocker(id: string): Promise<boolean> {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await execInContainer(id, ['docker', 'info', '--format', '{{.ServerVersion}}'], {
        timeoutMs: 5000,
      });
      if (r.exitCode === 0) {
        console.log(`      inner dockerd ready: ${r.stdout.trim()}`);
        return true;
      }
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  console.log(`socket: ${config.dockerSocket}`);
  await docker.ping();
  check(true, 'docker engine reachable');

  await docker
    .getContainer(NAME)
    .remove({ force: true })
    .catch(() => undefined);

  const container = await docker.createContainer({
    Image: config.images['docker-dind'],
    name: NAME,
    Labels: { 'vlab.session': 'spike', 'vlab.spike': 'true' },
    Env: ['DOCKER_TLS_CERTDIR=', 'VLAB_REGISTRY_MIRROR='],
    HostConfig: {
      Privileged: true,
      Memory: 1024 * 1024 * 1024,
      NanoCpus: 1_000_000_000,
      PidsLimit: 512,
      AutoRemove: false,
    },
  });
  await container.start();
  check(true, 'privileged DinD container created with limits');

  const info = await container.inspect();
  check(info.HostConfig.Privileged === true, 'container is privileged');
  check(info.HostConfig.Memory === 1024 * 1024 * 1024, 'memory limit applied');

  const ready = await waitForInnerDocker(info.Id);
  check(ready, 'inner dockerd becomes ready');
  if (!ready) throw new Error('inner docker never became ready');

  const { exec, stream } = await startTtyExec(info.Id, { cols: 100, rows: 30 });
  let ttyOut = '';
  stream.on('data', (chunk: Buffer) => {
    ttyOut += chunk.toString('utf8');
  });

  await new Promise((r) => setTimeout(r, 800));
  stream.write('docker run -d --name web nginx:alpine\n');

  // The first pull can take a while; poll instead of sleeping a fixed time.
  let psOk = false;
  let psDetail = '';
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const ps = await execInContainer(
      info.Id,
      ['bash', '-lc', "docker ps --filter name=^/web$ --format '{{.Names}} {{.Image}}'"],
      { workdir: '/root' },
    );
    psDetail = ps.stdout.trim();
    if (ps.exitCode === 0 && psDetail.includes('web')) {
      psOk = true;
      break;
    }
  }

  check(ttyOut.includes('student@vlab'), 'TTY exec prints the vlab prompt');
  check(ttyOut.length > 0, 'command output streams back over the TTY', ttyOut.slice(-60).replace(/\n/g, ' '));

  await exec.resize({ w: 120, h: 40 });
  check(true, 'TTY resize accepted without error');

  check(psOk, 'check exec sees the student container', psDetail);

  let logText = '';
  for (let i = 0; i < 10; i++) {
    const log = await execInContainer(info.Id, ['cat', '/var/log/vlab/commands.log'], { timeoutMs: 5000 });
    logText = log.stdout;
    if (logText.includes('docker run -d --name web nginx:alpine')) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  check(
    logText.includes('docker run -d --name web nginx:alpine'),
    'PROMPT_COMMAND logged the command',
    logText.trim().slice(-100),
  );

  const missing = await execInContainer(
    info.Id,
    ['bash', '-lc', "docker volume ls -q | grep -qx 'data'"],
    { workdir: '/root' },
  );
  check(missing.exitCode !== 0, 'a check for an absent volume fails (exit != 0)', `exit=${missing.exitCode}`);

  stream.destroy();
  await container.stop({ t: 3 }).catch(() => undefined);
  await container.remove({ force: true }).catch(() => undefined);
  check(true, 'container stopped and removed');

  console.log(failures === 0 ? '\nSPIKE OK' : `\nSPIKE FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('SPIKE ERROR', err);
  await docker
    .getContainer(NAME)
    .remove({ force: true })
    .catch(() => undefined);
  process.exit(1);
});
