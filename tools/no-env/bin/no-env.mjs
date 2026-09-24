#!/usr/bin/env node
/**
 * no-env: run a command with some environment variables removed.
 *
 * Usage:
 *   no-env VAR [VAR...] -- <command> [args...]
 *
 * This is the portable stand-in for `env -u VAR <command>`: `cross-env` can set
 * variables but not unset them, and `env` does not exist on Windows. Removing a
 * variable (rather than setting it empty) matters for CLIs built on commander,
 * which react to `VAR in process.env` regardless of the value.
 */
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 1 || sep === argv.length - 1) {
  console.error("usage: no-env VAR [VAR...] -- <command> [args...]");
  process.exit(2);
}

const vars = argv.slice(0, sep);
const [command, ...args] = argv.slice(sep + 1);

const env = { ...process.env };
for (const name of vars) delete env[name];

// shell:true so the command resolves through node_modules/.bin shims on Windows
const child = spawn(command, args, { stdio: "inherit", env, shell: true });
child.on("error", (error) => {
  console.error(`no-env: cannot run ${command}: ${error.message}`);
  process.exit(1);
});
child.on("close", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
