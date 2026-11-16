const { spawn } = require('child_process');
const path = require('path');
const electronBinary = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const extraArgs = process.platform === 'linux' ? ['--no-sandbox'] : [];
const args = [path.join(__dirname, '..'), ...extraArgs, ...process.argv.slice(2)];

const child = spawn(electronBinary, args, {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (typeof code === 'number') {
    process.exit(code);
    return;
  }
  if (signal && process.platform !== 'win32') {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(1);
});
