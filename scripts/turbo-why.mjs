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

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { styleText } from "node:util";

// ── style helpers ────────────────────────────────────────────────────────────
const red = (t) => styleText("redBright", t);
const green = (t) => styleText("greenBright", t);
const yellow = (t) => styleText("yellowBright", t);
const dim = (t) => styleText("dim", t);
const bold = (t) => styleText("bold", t);
const boldRed = (t) => styleText(["bold", "redBright"], t);

function short(taskId) {
  if (!taskId.includes("#")) return taskId;
  let [pkg, task] = taskId.split("#", 2);
  for (const prefix of ["@milaboratories/", "@platforma-sdk/", "@platforma-open/", "@mi-tests/"]) {
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
  const pkgPath = join(process.cwd(), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const scripts = pkg.scripts ?? {};

  const env = {};
  const seen = new Set();

  let current = scriptName;
  while (true) {
    if (seen.has(current)) {
      console.error(red(`Circular script reference: ${current}`));
      process.exit(1);
    }
    seen.add(current);

    const value = scripts[current];
    if (!value) {
      console.error(red(`Script "${current}" not found in package.json`));
      process.exit(1);
    }

    // Tokenize the script value, collecting leading KEY=value env vars
    const tokens = value.split(/\s+/);
    let i = 0;
    while (i < tokens.length && /^\w+=\S+$/.test(tokens[i])) {
      const [k, ...rest] = tokens[i].split("=");
      env[k] = rest.join("=");
      i++;
    }
    const rest = tokens.slice(i);

    // Case 1: turbo run <args>
    if (rest[0] === "turbo" && rest[1] === "run") {
      return { turboArgs: rest.slice(2), env };
    }

    // Case 2: pnpm <script> [-- extra-args]  →  follow the chain
    if (rest[0] === "pnpm") {
      const nextScript = rest[1];
      // Collect extra args after `--` (e.g. pnpm test -- --force)
      // but ignore `--` separator and args like --output-logs since those
      // will be on the turbo level eventually
      current = nextScript;
      continue;
    }

    // Case 3: npx turbo run <args>
    if (rest[0] === "npx" && rest[1] === "turbo" && rest[2] === "run") {
      return { turboArgs: rest.slice(3), env };
    }

    console.error(red(`Script "${scriptName}" does not resolve to a turbo command.`));
    console.error(dim(`Resolved to: ${value}`));
    process.exit(1);
  }
}

function runDryRun(turboArgs, env) {
  const turboCmd = `npx turbo run ${turboArgs.join(" ")} --dry-run=json`;
  let stdout;
  try {
    stdout = execSync(turboCmd, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, ...env },
    });
  } catch (e) {
    console.error(red("turbo dry-run failed:"));
    console.error(e.stderr ?? e.message);
    process.exit(1);
  }

  const idx = stdout.indexOf("{");
  if (idx === -1) {
    console.error(red("No JSON in turbo output"));
    process.exit(1);
  }
  return JSON.parse(stdout.slice(idx));
}

function analyse(data) {
  const tasks = data.tasks ?? [];
  if (!tasks.length) {
    console.log(yellow("No tasks in dry-run output."));
    return;
  }

  // Filter out tasks with no actual command (<NONEXISTENT>) — these are
  // packages that don't define the given script. Turbo skips them at runtime
  // but dry-run reports them as MISS since there are no cached artifacts.
  const realTasks = tasks.filter((t) => t.command !== "<NONEXISTENT>");
  const skipped = tasks.length - realTasks.length;

  const hits = realTasks.filter((t) => t.cache.status === "HIT");
  const misses = realTasks.filter((t) => t.cache.status !== "HIT");

  // ── summary ──────────────────────────────────────────────────────────
  console.log();
  console.log(
    `${bold("Cache summary:")}  ` +
      `${green(`${hits.length} HIT`)}  /  ` +
      `${red(`${misses.length} MISS`)}  /  ` +
      `${realTasks.length} total` +
      (skipped ? `  ${dim(`(${skipped} skipped — no script)`)}` : ""),
  );

  const globalExtDeps = data.globalCacheInputs?.hashOfExternalDependencies;
  if (globalExtDeps) {
    console.log(dim(`Global extDeps: ${globalExtDeps}`));
  }

  if (!misses.length) {
    const saved = hits.reduce((s, t) => s + (t.cache.timeSaved ?? 0), 0);
    console.log(
      `\n${green("Everything is cached!")}  (estimated time saved: ${Math.round(saved / 1000)}s)`,
    );
    return;
  }

  // ── dependency graph among misses ────────────────────────────────────
  const taskMap = new Map(realTasks.map((t) => [t.taskId, t]));
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
  console.log(`\n${bold(`Root causes (${rootCauses.length} tasks with own changes):`)}`);
  console.log(dim("These tasks have cache misses NOT caused by upstream rebuilds.\n"));

  const rootIds = new Set(rootCauses.map((r) => r.taskId));

  for (const rc of rootCauses.sort((a, b) => a.taskId.localeCompare(b.taskId))) {
    const tid = rc.taskId;
    console.log(`  ${boldRed(short(tid))}  ${dim(`hash: ${rc.hash}`)}`);

    // dependency hashes (HIT deps that contribute to this task's hash)
    const deps = rc.dependencies ?? [];
    if (deps.length) {
      const depInfo = deps
        .map((d) => {
          const dt = taskMap.get(d);
          if (!dt) return null;
          return `${short(d)}=${dt.hash?.slice(0, 12) ?? "?"}`;
        })
        .filter(Boolean)
        .join(", ");
      if (depInfo) console.log(dim(`    deps: ${depInfo}`));
    }

    // task-level external dependencies hash
    if (rc.hashOfExternalDependencies) {
      console.log(dim(`    extDeps: ${rc.hashOfExternalDependencies}`));
    }

    // input files grouped by recency
    const inputs = rc.inputs ?? {};
    const inputCount = Object.keys(inputs).length;
    if (inputCount) {
      console.log(dim(`    ${inputCount} input files`));

      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const recent = [];
      for (const filePath of Object.keys(inputs)) {
        try {
          const mtime = statSync(filePath).mtimeMs;
          if (now - mtime <= ONE_DAY) {
            recent.push({ filePath, hash: inputs[filePath], mtime });
          }
        } catch {
          // file may not exist (generated/deleted)
        }
      }

      if (recent.length) {
        console.log(yellow(`    Changed in last 24h (${recent.length}):`));
        for (const f of recent.sort((a, b) => b.mtime - a.mtime)) {
          const time = new Date(f.mtime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          console.log(dim(`      ${f.hash.slice(0, 8)}  ${time}  ${f.filePath}`));
        }
      }
    }

    // env vars
    const envVars = rc.environmentVariables?.specified?.env ?? [];
    if (envVars.length) {
      console.log(dim(`    env vars in hash: ${envVars.join(", ")}`));
    }

    // downstream cascade
    const downstream = collectDownstream(tid, children);
    if (downstream.size) {
      console.log(yellow(`    triggers rebuild of ${downstream.size} downstream task(s)`));
    }

    console.log();
  }

  // ── cascade-only misses ──────────────────────────────────────────────
  const cascadeOnly = misses.filter((t) => hasMissUpstream.has(t.taskId) && !rootIds.has(t.taskId));
  if (cascadeOnly.length) {
    console.log(bold(`Cascade-only rebuilds (${cascadeOnly.length} tasks):`));
    console.log(dim("These rebuild only because an upstream dependency changed.\n"));

    for (const t of cascadeOnly.sort((a, b) => a.taskId.localeCompare(b.taskId))) {
      const depsMiss = (t.dependencies ?? []).filter((d) => missIds.has(d));
      const depStr = depsMiss.map(short).join(", ");
      console.log(`  ${yellow(short(t.taskId))}  ${dim(`hash: ${t.hash}`)}  <- ${depStr}`);
    }
    console.log();
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (!args.length) {
  console.log(`Usage: node scripts/turbo-why.mjs <script-name>

The argument is a script name from package.json.
The script resolves pnpm→turbo chains and collects env vars.

Examples:
  node scripts/turbo-why.mjs build        # "build" → turbo run build
  node scripts/turbo-why.mjs build:local   # "build:local" → PL_PKG_DEV=local → turbo run build
  node scripts/turbo-why.mjs test:local    # "test:local" → PL_PKG_DEV=local → turbo run test`);
  process.exit(1);
}

const scriptName = args[0];
const { turboArgs, env } = resolveScript(scriptName);

const envStr = Object.entries(env)
  .map(([k, v]) => `${k}=${v}`)
  .join(" ");
const displayCmd = [envStr, "turbo run", ...turboArgs, "--dry-run=json"].filter(Boolean).join(" ");
console.log(dim(`${scriptName} → ${displayCmd}`));

const data = runDryRun(turboArgs, env);
analyse(data);
