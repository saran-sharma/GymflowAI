#!/usr/bin/env node

/**
 * GymFlow AI - Diagnostic Status Check
 *
 * Checks health of Backend (:8000), Database, Metro (:8081),
 * Codespaces port visibility, and Expo mobile configuration.
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const backendPort = 8000;
const metroPort = 8081;

const codespaceName = process.env.CODESPACE_NAME;
const portDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
const isCodespaces = Boolean(codespaceName);

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

async function checkBackend() {
  try {
    const res = await fetchUrl(`http://127.0.0.1:${backendPort}/api/v1/health`, 2000);
    if (res.statusCode === 200) {
      try {
        const json = JSON.parse(res.body);
        return {
          ok: true,
          status: json.status,
          db: json.database || 'up',
          serverTime: json.server_time,
        };
      } catch {
        return { ok: true, status: 'ok', db: 'unknown' };
      }
    }
  } catch {}

  // Fallback probe
  try {
    const rootRes = await fetchUrl(`http://127.0.0.1:${backendPort}/`, 1500);
    if (rootRes.statusCode === 200) {
      return { ok: true, status: 'ok', db: 'unknown' };
    }
  } catch {}

  return { ok: false, status: 'stopped', db: 'down' };
}

async function checkMetro() {
  try {
    const res = await fetchUrl(`http://127.0.0.1:${metroPort}/status`, 2000);
    if (res.statusCode === 200 && res.body.includes('packager-status:running')) {
      return { ok: true, status: 'running' };
    }
  } catch {}
  return { ok: false, status: 'stopped' };
}

function checkExpoConfig() {
  const appJsonPath = path.join(REPO_ROOT, 'apps', 'mobile', 'app.json');
  const envPath = path.join(REPO_ROOT, 'apps', 'mobile', '.env');

  const issues = [];
  let apiUrl = null;

  if (!fs.existsSync(appJsonPath)) {
    issues.push('apps/mobile/app.json not found');
  } else {
    try {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      if (!appJson.expo || !appJson.expo.scheme) {
        issues.push('app.json missing expo.scheme');
      }
    } catch {
      issues.push('app.json has invalid JSON format');
    }
  }

  if (!fs.existsSync(envPath)) {
    issues.push('apps/mobile/.env missing');
  } else {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/EXPO_PUBLIC_API_URL=(.+)/);
    if (match) {
      apiUrl = match[1].trim();
    } else {
      issues.push('EXPO_PUBLIC_API_URL not set in apps/mobile/.env');
    }
  }

  return {
    ok: issues.length === 0,
    apiUrl,
    issues,
  };
}

function checkCodespaces() {
  if (!isCodespaces) {
    return { isCodespaces: false, portsPublic: true, detail: 'Local environment' };
  }

  let portsPublic = true;
  let detail = `Codespace: ${codespaceName}`;

  try {
    const out = execSync('gh codespace ports', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out.includes('8000') && out.includes('private')) {
      portsPublic = false;
    }
    if (out.includes('8081') && out.includes('private')) {
      portsPublic = false;
    }
  } catch {
    // If gh CLI not authenticated, we assume configured via devcontainer.json
  }

  return { isCodespaces: true, portsPublic, detail };
}

async function main() {
  console.log(`\n${c.bold}GymFlow AI — System Diagnostics${c.reset}\n`);

  const backend = await checkBackend();
  const metro = await checkMetro();
  const expo = checkExpoConfig();
  const cs = checkCodespaces();

  const fixes = [];

  // 1. Backend Status
  if (backend.ok) {
    console.log(`Backend : 8000         ${c.green}✓ RUNNING${c.reset}`);
  } else {
    console.log(`Backend : 8000         ${c.red}✗ STOPPED${c.reset}`);
    fixes.push('Start backend with: npm run dev (or npm run dev:backend)');
  }

  // 2. Database Status
  if (backend.db === 'up') {
    console.log(`Database               ${c.green}✓ CONNECTED${c.reset}`);
  } else if (backend.ok && backend.db !== 'up') {
    console.log(`Database               ${c.red}✗ DISCONNECTED (${backend.db})${c.reset}`);
    fixes.push('Database error: check Postgres service or run alembic upgrade head');
  } else {
    console.log(`Database               ${c.yellow}○ UNKNOWN (backend stopped)${c.reset}`);
  }

  // 3. Metro Status
  if (metro.ok) {
    console.log(`Metro   : 8081         ${c.green}✓ RUNNING${c.reset}`);
  } else {
    console.log(`Metro   : 8081         ${c.red}✗ STOPPED${c.reset}`);
    fixes.push('Start Metro with: npm run dev (or npm run dev:mobile)');
  }

  // 4. Codespaces port
  if (cs.isCodespaces) {
    if (cs.portsPublic) {
      console.log(`Codespaces Ports       ${c.green}✓ PUBLIC (8000, 8081)${c.reset}`);
    } else {
      console.log(`Codespaces Ports       ${c.red}✗ PRIVATE${c.reset}`);
      fixes.push('Make ports public: gh codespace ports visibility 8000:public 8081:public');
    }
  } else {
    console.log(`Environment            ${c.green}✓ LOCAL DEV${c.reset}`);
  }

  // 5. Expo Configuration
  if (expo.ok) {
    console.log(`Expo Configuration     ${c.green}✓ CONFIGURED${c.reset} (${expo.apiUrl})`);
  } else {
    console.log(`Expo Configuration     ${c.red}✗ INCOMPLETE${c.reset}`);
    for (const issue of expo.issues) {
      fixes.push(`Fix Expo config: ${issue}`);
    }
  }

  console.log('');

  if (fixes.length > 0) {
    console.log(`${c.bold}${c.yellow}Action Items / Fixes:${c.reset}`);
    fixes.forEach((f, idx) => console.log(`  ${idx + 1}. ${f}`));
    console.log('');
  } else {
    console.log(`${c.green}${c.bold}All systems healthy! Ready for development.${c.reset}\n`);
  }
}

main().catch(console.error);
