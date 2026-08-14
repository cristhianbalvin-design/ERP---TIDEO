import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const operationsRoot = resolve(root, 'operaciones-app');
const run = (args, cwd = root) => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', ['npm', ...args].join(' ')], { cwd, stdio: 'inherit' });
    return;
  }
  execFileSync('npm', args, { cwd, stdio: 'inherit' });
};

run(['run', 'build:admin']);
run(['ci'], operationsRoot);
run(['run', 'build'], operationsRoot);

const operationsOutput = resolve(operationsRoot, 'dist');
const deploymentOperationsOutput = resolve(root, 'dist', 'operaciones');
rmSync(deploymentOperationsOutput, { recursive: true, force: true });
cpSync(operationsOutput, deploymentOperationsOutput, { recursive: true });
