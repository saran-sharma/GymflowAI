#!/usr/bin/env node

/**
 * GymFlow AI - Clean Shutdown Utility
 *
 * Stops running Backend and Metro processes and clears PID files.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DEV_DIR = path.join(REPO_ROOT, '.dev');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
    return true;
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
      return true;
    } catch {
      return false;
    }
  }
}

function killPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = out.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid)) && Number(pid) > 0) {
          killPid(Number(pid));
        }
      }
    } else {
      execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch {}
}

function main() {
  console.log(`\n${c.bold}Stopping GymFlow AI development services...${c.reset}`);

  // 1. Kill from PID files
  const pids = ['backend', 'metro'];
  for (const name of pids) {
    const pidFile = path.join(DEV_DIR, `${name}.pid`);
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
        if (!isNaN(pid)) {
          console.log(`Stopping ${name} (PID: ${pid})...`);
          killPid(pid);
        }
        fs.unlinkSync(pidFile);
      } catch {}
    }
  }

  // 2. Kill by port bindings to ensure ports 8000 and 8081 are free
  killPort(8000);
  killPort(8081);

  console.log(`${c.green}✓ All GymFlow AI development services have been stopped.${c.reset}\n`);
}

main();
