#!/usr/bin/env node

/**
 * GymFlow AI - Unified Development Orchestrator
 *
 * Runs and manages the FastAPI backend (port 8000) and Expo/Metro (port 8082).
 * Automatically detects GitHub Codespaces vs Local environment, validates health,
 * configures port forwarding, and handles clean process lifecycles.
 */

import { spawn, execSync } from 'child_process';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DEV_DIR = path.join(REPO_ROOT, '.dev');

// Ensure .dev directory exists for PID and state files
if (!fs.existsSync(DEV_DIR)) {
  fs.mkdirSync(DEV_DIR, { recursive: true });
}

// Colors for terminal formatting
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
};

const args = process.argv.slice(2);
const backendOnly = args.includes('--backend-only');
const mobileOnly = args.includes('--mobile-only');
const cleanCache = args.includes('--clean') || args.includes('-c');

// ------------------------------------------------------------- Environment
const codespaceName = process.env.CODESPACE_NAME;
const portDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
const isCodespaces = Boolean(codespaceName);

const backendPort = 8000;
const metroPort = 8082;

const backendPublicUrl = isCodespaces
  ? `https://${codespaceName}-${backendPort}.${portDomain}`
  : `http://localhost:${backendPort}`;

const metroPublicUrl = isCodespaces
  ? `https://${codespaceName}-${metroPort}.${portDomain}`
  : `http://localhost:${metroPort}`;

const metroPackagerHost = isCodespaces
  ? `${codespaceName}-${metroPort}.${portDomain}`
  : `localhost:${metroPort}`;

// ---------------------------------------------------------------- Utilities
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchUrl(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const server = http.get(`http://127.0.0.1:${port}/`, { timeout: 800 }, (res) => {
      resolve(true);
    });
    server.on('error', () => resolve(false));
    server.on('timeout', () => {
      server.destroy();
      resolve(false);
    });
  });
}

async function checkBackendHealth() {
  try {
    const res = await fetchUrl(`http://127.0.0.1:${backendPort}/api/v1/health`, 1500);
    if (res.statusCode === 200) {
      try {
        const json = JSON.parse(res.body);
        return { running: true, healthy: json.status === 'ok', db: json.database || 'unknown' };
      } catch {
        return { running: true, healthy: true, db: 'unknown' };
      }
    }
  } catch {
    // try fallback root
    try {
      const rootRes = await fetchUrl(`http://127.0.0.1:${backendPort}/`, 1000);
      if (rootRes.statusCode === 200) {
        return { running: true, healthy: true, db: 'unknown' };
      }
    } catch {}
  }
  return { running: false, healthy: false, db: 'down' };
}

async function checkMetroStatus() {
  try {
    const res = await fetchUrl(`http://127.0.0.1:${metroPort}/status`, 1500);
    if (res.statusCode === 200 && res.body.includes('packager-status:running')) {
      return { running: true };
    }
  } catch {}
  return { running: false };
}

function findPython() {
  const venvBin = process.platform === 'win32'
    ? path.join(REPO_ROOT, '.venv', 'Scripts', 'python.exe')
    : path.join(REPO_ROOT, '.venv', 'bin', 'python');

  if (fs.existsSync(venvBin)) {
    return venvBin;
  }

  // Fall back to a system interpreter, and actually check each candidate runs.
  // Reached only when .venv is missing, which is the moment a wrong answer is
  // least recoverable — the backend fails to spawn with no useful message.
  const candidates = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch {}
  }
  return candidates[0];
}

function syncEnvFiles() {
  // 1. backend/.env
  const backendEnv = path.join(REPO_ROOT, 'backend', '.env');
  const backendExample = path.join(REPO_ROOT, 'backend', '.env.example');
  if (!fs.existsSync(backendEnv) && fs.existsSync(backendExample)) {
    fs.copyFileSync(backendExample, backendEnv);
  }

  // 2. apps/mobile/.env
  const mobileEnv = path.join(REPO_ROOT, 'apps', 'mobile', '.env');
  const mobileEnvContent = `# Automatically managed by dev orchestrator. Safe to edit.
EXPO_PUBLIC_API_URL=${backendPublicUrl}
EXPO_PUBLIC_PUSH_ENABLED=false
`;

  if (!fs.existsSync(mobileEnv)) {
    fs.writeFileSync(mobileEnv, mobileEnvContent, 'utf8');
  } else {
    // If in Codespaces and EXPO_PUBLIC_API_URL is pointing elsewhere or missing, update it
    const currentContent = fs.readFileSync(mobileEnv, 'utf8');
    if (isCodespaces && !currentContent.includes(`EXPO_PUBLIC_API_URL=${backendPublicUrl}`)) {
      const updated = currentContent.replace(
        /EXPO_PUBLIC_API_URL=.*/g,
        `EXPO_PUBLIC_API_URL=${backendPublicUrl}`
      );
      if (updated !== currentContent) {
        fs.writeFileSync(mobileEnv, updated, 'utf8');
      } else {
        fs.writeFileSync(mobileEnv, mobileEnvContent, 'utf8');
      }
    }
  }
}

function configureCodespacesPorts() {
  if (!isCodespaces) return;
  try {
    execSync(`gh codespace ports visibility 8000:public 8082:public`, { stdio: 'ignore' });
  } catch {
    // Non-fatal if gh is not logged in or in devcontainer
  }
}

// ------------------------------------------------------------- Process Handling
const childProcesses = [];

function savePid(name, pid) {
  try {
    fs.writeFileSync(path.join(DEV_DIR, `${name}.pid`), String(pid), 'utf8');
  } catch {}
}

function removePid(name) {
  try {
    const file = path.join(DEV_DIR, `${name}.pid`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

function killProcess(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
}

function cleanup() {
  console.log(`\n${c.yellow}Shutting down GymFlow AI development services...${c.reset}`);
  for (const child of childProcesses) {
    if (child && child.pid) {
      killProcess(child.pid);
    }
  }
  removePid('backend');
  removePid('metro');
  console.log(`${c.green}✓ Clean shutdown complete.${c.reset}`);
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
if (process.platform !== 'win32') {
  process.on('SIGHUP', cleanup);
}

// ---------------------------------------------------------------- Main Flow
async function main() {
  console.log(`${c.bold}${c.cyan}======================================================${c.reset}`);
  console.log(`${c.bold}${c.white} GymFlow AI — Unified Development Environment${c.reset}`);
  console.log(`${c.bold}${c.cyan}======================================================${c.reset}\n`);

  syncEnvFiles();
  configureCodespacesPorts();

  // 1. Start / Verify Backend
  let backendStatus = await checkBackendHealth();
  if (!mobileOnly) {
    if (backendStatus.running) {
      console.log(`${c.green}✓${c.reset} Backend already running on port ${backendPort} (DB: ${backendStatus.db})`);
    } else {
      console.log(`${c.cyan}▸${c.reset} Starting FastAPI backend on port ${backendPort}...`);
      const python = findPython();
      const backendProc = spawn(
        python,
        ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '0.0.0.0', '--port', String(backendPort)],
        {
          cwd: path.join(REPO_ROOT, 'backend'),
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        }
      );

      savePid('backend', backendProc.pid);
      childProcesses.push(backendProc);

      let backendError = '';
      backendProc.stderr.on('data', (d) => {
        const str = d.toString();
        backendError += str;
        if (str.includes('ERROR') || str.includes('Traceback') || str.includes('ModuleNotFoundError')) {
          process.stderr.write(`${c.red}[Backend Error] ${str}${c.reset}`);
        }
      });

      let exitedEarly = false;
      backendProc.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          exitedEarly = true;
        }
      });

      // Poll until backend is up (up to 10 seconds)
      let ready = false;
      for (let i = 0; i < 20; i++) {
        if (exitedEarly) break;
        await sleep(500);
        backendStatus = await checkBackendHealth();
        if (backendStatus.running) {
          ready = true;
          break;
        }
      }

      if (ready) {
        console.log(`${c.green}✓${c.reset} Backend started successfully.`);
      } else if (exitedEarly) {
        console.log(`${c.red}✗ Backend process failed to start.${c.reset}`);
        if (!fs.existsSync(path.join(REPO_ROOT, '.venv'))) {
          console.log(`${c.yellow}Hint: Python virtual environment (.venv) not found. In Codespaces this is created automatically. Locally, run: python -m venv .venv && .venv/bin/pip install -r backend/requirements-dev.txt${c.reset}`);
        }
      } else {
        console.log(`${c.yellow}⚠ Backend process spawned; waiting for endpoints...${c.reset}`);
      }
    }
  }

  // 2. Start / Verify Metro Bundler
  let metroStatus = await checkMetroStatus();
  if (!backendOnly) {
    if (metroStatus.running) {
      console.log(`${c.green}✓${c.reset} Metro bundler already running on port ${metroPort}`);
    } else {
      console.log(`${c.cyan}▸${c.reset} Starting Metro bundler for apps/mobile on port ${metroPort}...`);

      const metroEnv = {
        ...process.env,
        EXPO_PUBLIC_API_URL: backendPublicUrl,
      };

      if (isCodespaces) {
        metroEnv.REACT_NATIVE_PACKAGER_HOSTNAME = metroPackagerHost;
        metroEnv.EXPO_PACKAGER_PROXY_URL = metroPublicUrl;
      }

      const expoArgs = ['start', '--port', String(metroPort)];
      if (cleanCache) {
        expoArgs.push('--clear');
      }

      const metroProc = spawn(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['expo', ...expoArgs],
        {
          cwd: path.join(REPO_ROOT, 'apps', 'mobile'),
          stdio: 'inherit',
          detached: process.platform !== 'win32',
          env: metroEnv,
        }
      );

      savePid('metro', metroProc.pid);
      childProcesses.push(metroProc);

      // Poll for Metro status
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        metroStatus = await checkMetroStatus();
        if (metroStatus.running) break;
      }
    }
  }

  // 3. Print Overview Summary Banner
  console.log(`\n${c.bold}${c.white}========================================${c.reset}`);
  console.log(`${c.bold}${c.green} GymFlow AI Development Services${c.reset}`);
  console.log(`${c.bold}${c.white}========================================${c.reset}`);

  console.log(`\n${c.bold}Backend API:${c.reset}`);
  console.log(`  Status: ${backendStatus.running ? `${c.green}RUNNING${c.reset}` : `${c.yellow}PENDING${c.reset}`}`);
  console.log(`  URL:    ${c.cyan}${backendPublicUrl}${c.reset}`);
  console.log(`  Docs:   ${backendPublicUrl}/docs`);
  console.log(`  Health: ${backendStatus.healthy ? `${c.green}OK${c.reset}` : `${c.yellow}DEGRADED${c.reset}`} (Database: ${backendStatus.db})`);

  if (!backendOnly) {
    console.log(`\n${c.bold}Metro Bundler:${c.reset}`);
    console.log(`  Status: ${metroStatus.running ? `${c.green}RUNNING${c.reset}` : `${c.green}READY${c.reset}`}`);
    console.log(`  URL:    ${c.cyan}${metroPublicUrl}${c.reset}`);

    console.log(`\n${c.bold}Mobile App (apps/mobile):${c.reset}`);
    console.log(`  Custom Scheme:    ${c.magenta}gymflow://${c.reset}`);
    console.log(`  Dev Client URL:   ${c.cyan}${metroPublicUrl}${c.reset}`);
    console.log(`  Note:              Enter this URL in the Android development build.`);


    console.log(`\n${c.bold}${c.white}========================================${c.reset}`);
    console.log(`${c.bold} Connecting your Android Dev Build:${c.reset}`);
    console.log(` 1. Open the GymFlow AI dev build APK on your device.`);
    console.log(` 2. Enter URL: ${c.cyan}${metroPublicUrl}${c.reset}`);
    console.log(`    OR scan the Expo QR code printed by Metro.`);
    console.log(` 3. Fast Refresh is active — edits reload automatically!`);
    console.log(`${c.bold}${c.white}========================================${c.reset}`);
  }

  console.log(`\n${c.dim}Press Ctrl+C to stop all development services.${c.reset}\n`);

  // Keep process alive if child processes are running
  if (childProcesses.length > 0) {
    await new Promise(() => {});
  }
}

main().catch((err) => {
  console.error(`${c.red}Fatal Error:${c.reset}`, err);
  process.exit(1);
});
