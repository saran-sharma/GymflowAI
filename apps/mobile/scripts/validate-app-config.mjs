#!/usr/bin/env node
/**
 * Validate app.json against the app-config schema of the *installed* Expo SDK.
 *
 * `expo-doctor` runs this check by downloading the schema from exp.host. That
 * makes it useless on a locked-down network and, more importantly, means a bad
 * key is only caught by whoever happens to run doctor. This reads
 * `@expo/config-types`, which ships with the SDK and is generated from the same
 * schema, so the check runs offline and on every pull request.
 *
 * It catches exactly one class of mistake — properties the current SDK does not
 * accept — which is the one that bites when an SDK drops a key it used to have
 * (`newArchEnabled`, top-level `splash`, `android.edgeToEdgeEnabled` all went
 * this way once their behaviour became the default).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const typesPkg = path.join(appDir, 'node_modules/@expo/config-types');
const dtsPath = path.join(typesPkg, 'build/ExpoConfig.d.ts');

if (!fs.existsSync(dtsPath)) {
  console.error('@expo/config-types is not installed — run npm ci first.');
  process.exit(2);
}

const dts = fs.readFileSync(dtsPath, 'utf8');

/**
 * Property names declared directly on a named interface.
 *
 * Nested object literals are blanked out as the body is scanned, so a key
 * belonging to an inner shape is never mistaken for a top-level one.
 */
function propertiesOf(interfaceName) {
  const start = dts.indexOf(`interface ${interfaceName} {`);
  if (start === -1) throw new Error(`interface ${interfaceName} not found`);

  let depth = 0;
  let body = '';
  for (let i = dts.indexOf('{', start); i < dts.length; i++) {
    const char = dts[i];
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) break;
    }
    body += depth === 1 && char !== '{' ? char : '\0';
  }

  return new Set([...body.matchAll(/^\s*'?([A-Za-z_][\w-]*)'?\??\s*:/gm)].map((m) => m[1]));
}

const sdkTypesVersion = JSON.parse(
  fs.readFileSync(path.join(typesPkg, 'package.json'), 'utf8'),
).version;

const appJsonPath = path.join(appDir, 'app.json');
const rawAppJson = fs.readFileSync(appJsonPath, 'utf8');

// Conflict markers make app.json invalid JSON, and every Expo command then
// fails with `Unexpected token '<'` — which points at nothing useful. Name the
// real problem instead.
const conflictMarkers = rawAppJson
  .split('\n')
  .map((line, index) => [index + 1, line])
  .filter(([, line]) => /^(<{7}|={7}|>{7})(\s|$)/.test(line));

if (conflictMarkers.length > 0) {
  console.error('app.json contains unresolved merge conflict markers:\n');
  for (const [lineNumber, line] of conflictMarkers) {
    console.error(`  ✖ line ${lineNumber}: ${line.trim()}`);
  }
  console.error(
    '\nResolve the conflict before anything else. Keep the side without' +
      "\n`newArchEnabled`, a top-level `splash` block or `android.edgeToEdgeEnabled`:" +
      '\nthis SDK rejects all three, and their behaviour is now the default or lives' +
      '\nin the expo-splash-screen plugin. Keep whichever side has the real EAS' +
      '\nprojectId.',
  );
  process.exit(1);
}

let config;
try {
  config = JSON.parse(rawAppJson).expo;
} catch (error) {
  console.error(`app.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

const sections = [
  ['(root)', config, 'ExpoConfig'],
  ['android', config.android, 'Android'],
  ['ios', config.ios, 'IOS'],
  ['web', config.web, 'Web'],
];

const problems = [];
for (const [label, value, interfaceName] of sections) {
  if (!value) continue;
  const allowed = propertiesOf(interfaceName);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) problems.push(`${label}: additional property '${key}'`);
  }
}

if (problems.length > 0) {
  console.error(`app.json is not valid for @expo/config-types ${sdkTypesVersion}:\n`);
  for (const problem of problems) console.error(`  ✖ ${problem}`);
  console.error(
    '\nA property the SDK no longer accepts is usually one whose behaviour became' +
      '\nthe default, or moved into a config plugin. Check the SDK release notes' +
      '\nbefore deleting it, so the behaviour it asked for is genuinely preserved.',
  );
  process.exit(1);
}

console.log(`app.json: no additional properties (@expo/config-types ${sdkTypesVersion})`);
