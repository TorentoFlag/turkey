import { spawn } from 'node:child_process';

const entrypoint =
  process.argv[2] === 'worker' ? 'dist/worker.js' : 'dist/main.js';

const compiler = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsc', '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'],
  { stdio: 'inherit' },
);
const server = spawn(process.execPath, ['--watch', entrypoint], {
  stdio: 'inherit',
});

let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  compiler.kill('SIGTERM');
  server.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
compiler.on('exit', stop);
server.on('exit', stop);
