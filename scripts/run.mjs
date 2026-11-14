import { spawn } from 'node:child_process';
import { apiPort } from '../server/config.js';

const mode = process.argv[2];
if (!['dev', 'start'].includes(mode)) throw new Error('Expected dev or start.');

const children = [
  spawn(process.execPath, ['server/index.js'], {
    stdio: 'inherit', env: { ...process.env, PORT: String(apiPort) },
  }),
  spawn(process.execPath, ['node_modules/next/dist/bin/next', mode === 'dev' ? 'dev' : 'start'], {
    stdio: 'inherit', env: { ...process.env, PORT: '3000' },
  }),
];

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill(signal);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
for (const child of children) child.on('exit', (code) => {
  if (!stopping) {
    stop();
    process.exitCode = code || 1;
  }
});
