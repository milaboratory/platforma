#!/usr/bin/env node

// Post-edit hook: runs deterministic checks after Write/Edit
// Adapted for pnpm monorepo with oxlint/oxfmt tooling.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? '';

// --- Read tool input from stdin ---

let filePath;
try {
  const raw = readFileSync(0, 'utf-8');
  const input = JSON.parse(raw);
  filePath = input.tool_input?.file_path ?? input.tool_input?.filePath;
} catch {
  process.exit(0);
}

if (!filePath || !existsSync(filePath)) {
  process.exit(0);
}

// --- Helpers ---

/** Walk up from a file to find the nearest directory containing a marker file. */
function findNearest(dir, marker) {
  let current = resolve(dir);
  const root = resolve(projectDir);
  while (current !== '/' && current !== root) {
    if (existsSync(join(current, marker))) return current;
    current = dirname(current);
  }
  // Check project root as well
  if (existsSync(join(root, marker))) return root;
  return '';
}

/** Find the nearest package root (directory with package.json) for a given file. */
function findPackageRoot(file) {
  return findNearest(dirname(file), 'package.json');
}

/** Read and parse a package.json, returning null on failure. */
function readPackageJson(pkgRoot) {
  try {
    return JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
}

/** Check whether pnpm is available. */
function hasPnpm() {
  try {
    execSync('command -v pnpm', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// --- Main ---

if (!hasPnpm()) {
  process.exit(0);
}

let errors = '';

const ext = extname(filePath);

if (['.ts', '.tsx', '.vue'].includes(ext)) {
  const pkgRoot = findPackageRoot(filePath);
  if (!pkgRoot) process.exit(0);

  const pkg = readPackageJson(pkgRoot);
  if (!pkg) process.exit(0);

  // Run linter via defined package script (delegates to ts-builder -> oxlint)
  if (pkg.scripts?.['linter:check']) {
    try {
      execSync('pnpm run linter:check', { cwd: pkgRoot, stdio: 'pipe' });
    } catch (e) {
      errors += `\nLinter errors:\n${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`;
    }
  }

  // Run formatter via defined package script (delegates to ts-builder -> oxfmt)
  if (pkg.scripts?.['fmt']) {
    try {
      execSync('pnpm run fmt', { cwd: pkgRoot, stdio: 'pipe' });
    } catch {
      // Formatter errors are non-blocking
    }
  }

  // Run TypeScript type check via the package's types:check script.
  if (existsSync(join(pkgRoot, 'tsconfig.json')) && pkg.scripts?.['types:check']) {
    try {
      execSync('pnpm run types:check', { cwd: pkgRoot, stdio: 'pipe' });
    } catch (e) {
      const relPath = filePath.startsWith(pkgRoot + '/')
        ? filePath.slice(pkgRoot.length + 1)
        : filePath;
      const output = `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`;
      // Only report errors that reference the edited file (ignore dependency errors)
      const fileErrors = output
        .split('\n')
        .filter((line) => line.includes(relPath))
        .join('\n');
      if (fileErrors) {
        errors += `\nTypeScript errors:\n${fileErrors}`;
      }
    }
  }
} else if (['.md', '.json'].includes(ext)) {
  // Markdown / JSON inside .claude/ — skip linting, just exit
  if (filePath.startsWith(join(projectDir, '.claude') + '/')) {
    process.exit(0);
  }
}

// If there were errors, block with feedback to Claude
if (errors) {
  process.stderr.write(`Static analysis found issues in ${filePath}:${errors}\n`);
  process.exit(2);
}
