#!/usr/bin/env node
/**
 * turbo-why: explains WHY turbo cache missed and shows the cascade of rebuilds.
 *
 * Usage:
 *   node scripts/turbo-why.mjs build           # resolves "build" script from package.json
 *   node scripts/turbo-why.mjs build:local      # resolves "build:local" → PL_PKG_DEV=local pnpm build → turbo run build
 *   node scripts/turbo-why.mjs test:local       # resolves "test:local" → PL_PKG_DEV=local pnpm test → turbo run test
 *
 * The first argument is a script name from package.json. The script resolves
 * the chain (pnpm <script> → pnpm <script> → turbo run ...) collecting
 * inline env vars along the way, then runs the turbo command with --dry-run=json.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── colours ──────────────────────────────────────────────────────────────────
const RED = '\x1b[91m';
const GREEN = '\x1b[92m';
const YELLOW = '\x1b[93m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function short(taskId) {
  if (!taskId.includes('#')) return taskId;
  let [pkg, task] = taskId.split('#', 2);
  for (const prefix of ['@milaboratories/', '@platforma-sdk/', '@platforma-open/', '@mi-tests/']) {
    if (pkg.startsWith(prefix)) {
      pkg = pkg.slice(prefix.length);
      break;
    }
  }
  return `${pkg}#${task}`;
}

function collectDownstream(tid, children) {
  const visited = new Set();
  const queue = [...(children.get(tid) ?? [])];
  while (queue.length) {
    const c = queue.pop();
    if (!visited.has(c)) {
      visited.add(c);
      queue.push(...(children.get(c) ?? []));
    }
  }
  return visited;
}

/**
 * Resolve a package.json script name into { turboArgs: string[], env: Record<string, string> }.
 * Follows the chain: pnpm <script> → pnpm <script> → turbo run <args>.
 * Collects inline env vars (KEY=value) along the way.
 */
function resolveScript(scriptName) {
  const pkgPath = join(process.cwd(), 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const scripts = pkg.scripts ?? {};

  const env = {};
  const seen = new Set();

  let current = scriptName;
  while (true) {
    if (seen.has(current)) {
      console.error(`${RED}Circular script reference: ${current}${RESET}`);
      process.exit(1);
    }
    seen.add(current);

    const value = scripts[current];
    if (!value) {
      console.error(`${RED}Script "${current}" not found in package.json${RESET}`);
      process.exit(1);
    }

    // Tokenize the script value, collecting leading KEY=value env vars
    const tokens = value.split(/\s+/);
    let i = 0;
    while (i < tokens.length && /^\w+=\S+$/.test(tokens[i])) {
      const [k, ...rest] = tokens[i].split('=');
      env[k] = rest.join('=');
      i++;
    }
    const rest = tokens.slice(i);

    // Case 1: turbo run <args>
    if (rest[0] === 'turbo' && rest[1] === 'run') {
      return { turboArgs: rest.slice(2), env };
    }

    // Case 2: pnpm <script> [-- extra-args]  →  follow the chain
    if (rest[0] === 'pnpm') {
      const nextScript = rest[1];
      // Collect extra args after `--` (e.g. pnpm test -- --force)
      // but ignore `--` separator and args like --output-logs since those
      // will be on the turbo level eventually
      current = nextScript;
      continue;
    }

    // Case 3: npx turbo run <args>
    if (rest[0] === 'npx' && rest[1] === 'turbo' && rest[2] === 'run') {
      return { turboArgs: rest.slice(3), env };
    }

    console.error(`${RED}Script "${scriptName}" does not resolve to a turbo command.${RESET}`);
    console.error(`${DIM}Resolved to: ${value}${RESET}`);
    process.exit(1);
  }
}

function runDryRun(turboArgs, env) {
  const turboCmd = `npx turbo run ${turboArgs.join(' ')} --dry-run=json`;
  let stdout;
  try {
    stdout = execSync(turboCmd, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, ...env },
    });
  } catch (e) {
    console.error(`${RED}turbo dry-run failed:${RESET}`);
    console.error(e.stderr ?? e.message);
    process.exit(1);
  }

  const idx = stdout.indexOf('{');
  if (idx === -1) {
    console.error(`${RED}No JSON in turbo output${RESET}`);
    process.exit(1);
  }
  return JSON.parse(stdout.slice(idx));
}

function analyse(data) {
  const tasks = data.tasks ?? [];
  if (!tasks.length) {
    console.log(`${YELLOW}No tasks in dry-run output.${RESET}`);
    return;
  }

  // Filter out tasks with no actual command (<NONEXISTENT>) — these are
  // packages that don't define the given script. Turbo skips them at runtime
  // but dry-run reports them as MISS since there are no cached artifacts.
  const realTasks = tasks.filter((t) => t.command !== '<NONEXISTENT>');
  const skipped = tasks.length - realTasks.length;

  const byId = new Map(realTasks.map((t) => [t.taskId, t]));
  const hits = realTasks.filter((t) => t.cache.status === 'HIT');
  const misses = realTasks.filter((t) => t.cache.status !== 'HIT');

  // ── summary ──────────────────────────────────────────────────────────
  console.log();
  console.log(
    `${BOLD}Cache summary:${RESET}  ` +
      `${GREEN}${hits.length} HIT${RESET}  /  ` +
      `${RED}${misses.length} MISS${RESET}  /  ` +
      `${realTasks.length} total` +
      (skipped ? `  ${DIM}(${skipped} skipped — no script)${RESET}` : '')
  );

  if (!misses.length) {
    const saved = hits.reduce((s, t) => s + (t.cache.timeSaved ?? 0), 0);
    console.log(`\n${GREEN}Everything is cached!${RESET}  (estimated time saved: ${Math.round(saved / 1000)}s)`);
    return;
  }

  // ── dependency graph among misses ────────────────────────────────────
  const missIds = new Set(misses.map((t) => t.taskId));

  const rootCauses = [];
  const hasMissUpstream = new Set();
  const children = new Map();

  for (const t of misses) {
    const deps = t.dependencies ?? [];
    const upstreamMisses = deps.filter((d) => missIds.has(d));
    if (upstreamMisses.length) {
      hasMissUpstream.add(t.taskId);
    } else {
      rootCauses.push(t);
    }
    // build children map
    for (const dep of deps) {
      if (missIds.has(dep)) {
        if (!children.has(dep)) children.set(dep, []);
        children.get(dep).push(t.taskId);
      }
    }
  }

  // ── print root causes ────────────────────────────────────────────────
  console.log(`\n${BOLD}Root causes (${rootCauses.length} tasks with own changes):${RESET}`);
  console.log(`${DIM}These tasks have cache misses NOT caused by upstream rebuilds.${RESET}\n`);

  const rootIds = new Set(rootCauses.map((r) => r.taskId));

  for (const rc of rootCauses.sort((a, b) => a.taskId.localeCompare(b.taskId))) {
    const tid = rc.taskId;
    console.log(`  ${RED}${BOLD}${short(tid)}${RESET}  ${DIM}hash: ${rc.hash}${RESET}`);

    // input files with hashes
    const inputs = rc.inputs ?? {};
    const inputFiles = Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b));
    if (inputFiles.length) {
      console.log(`    ${DIM}${inputFiles.length} input files:${RESET}`);
      for (const [file, hash] of inputFiles) {
        console.log(`      ${DIM}${hash.slice(0, 8)}  ${file}${RESET}`);
      }
    }

    // env vars
    const envVars = rc.environmentVariables?.specified?.env ?? [];
    if (envVars.length) {
      console.log(`    ${DIM}env vars in hash: ${envVars.join(', ')}${RESET}`);
    }

    // downstream cascade
    const downstream = collectDownstream(tid, children);
    if (downstream.size) {
      console.log(`    ${YELLOW}triggers rebuild of ${downstream.size} downstream task(s)${RESET}`);
    }

    console.log();
  }

  // ── cascade-only misses ──────────────────────────────────────────────
  const cascadeOnly = misses.filter((t) => hasMissUpstream.has(t.taskId) && !rootIds.has(t.taskId));
  if (cascadeOnly.length) {
    console.log(`${BOLD}Cascade-only rebuilds (${cascadeOnly.length} tasks):${RESET}`);
    console.log(`${DIM}These rebuild only because an upstream dependency changed.${RESET}\n`);

    for (const t of cascadeOnly.sort((a, b) => a.taskId.localeCompare(b.taskId))) {
      const depsMiss = (t.dependencies ?? []).filter((d) => missIds.has(d));
      const depStr = depsMiss.map(short).join(', ');
      console.log(`  ${YELLOW}${short(t.taskId)}${RESET}  ${DIM}hash: ${t.hash}${RESET}  <- ${depStr}`);
    }
    console.log();
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (!args.length) {
  console.log('Usage: node scripts/turbo-why.mjs <script-name>');
  console.log('');
  console.log('The argument is a script name from package.json.');
  console.log('The script resolves pnpm→turbo chains and collects env vars.');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/turbo-why.mjs build        # "build" → turbo run build');
  console.log('  node scripts/turbo-why.mjs build:local   # "build:local" → PL_PKG_DEV=local → turbo run build');
  console.log('  node scripts/turbo-why.mjs test:local    # "test:local" → PL_PKG_DEV=local → turbo run test');
  process.exit(1);
}

const scriptName = args[0];
const { turboArgs, env } = resolveScript(scriptName);

const envStr = Object.entries(env).map(([k, v]) => `${k}=${v}`).join(' ');
const displayCmd = [envStr, 'turbo run', ...turboArgs, '--dry-run=json'].filter(Boolean).join(' ');
console.log(`${DIM}${scriptName} → ${displayCmd}${RESET}`);

const data = runDryRun(turboArgs, env);
analyse(data);
