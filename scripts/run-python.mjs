#!/usr/bin/env node

/**
 * Cross-platform runner for Python tools and modules in backend.
 * Finds .venv (bin or Scripts) or falls back to system python.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/run-python.mjs <command|module> [args...]');
  process.exit(1);
}

const isWin = process.platform === 'win32';
const venvScripts = isWin
  ? path.join(REPO_ROOT, '.venv', 'Scripts')
  : path.join(REPO_ROOT, '.venv', 'bin');

const firstArg = args[0];
let cmd = firstArg;
let cmdArgs = args.slice(1);

// Check if tool exists directly in .venv
const toolInVenv = isWin
  ? path.join(venvScripts, `${firstArg}.exe`)
  : path.join(venvScripts, firstArg);

const pythonInVenv = isWin
  ? path.join(venvScripts, 'python.exe')
  : path.join(venvScripts, 'python');

if (fs.existsSync(toolInVenv)) {
  cmd = toolInVenv;
} else if (fs.existsSync(pythonInVenv)) {
  cmd = pythonInVenv;
  cmdArgs = args;
} else {
  // Fallback to system python
  cmd = isWin ? 'python' : 'python3';
  if (firstArg !== '-m' && !firstArg.endsWith('.py')) {
    cmdArgs = ['-m', ...args];
  } else {
    cmdArgs = args;
  }
}

const result = spawnSync(cmd, cmdArgs, {
  cwd: BACKEND_DIR,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONPATH: BACKEND_DIR,
  },
});

process.exit(result.status ?? 0);
