import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TargetType } from "./config-manager";

const rootDir = resolve(dirname(fileURLToPath(new URL(".", import.meta.url))), "../..");

function resolvePackageJson(req: ReturnType<typeof createRequire>, packageName: string): string {
  try {
    return req.resolve(`${packageName}/package.json`);
  } catch {
    // If ./package.json subpath is not in "exports", find it via the main entry
    const resolved = req.resolve(packageName);
    let dir = dirname(resolved);
    while (dir !== dirname(dir)) {
      try {
        const candidate = join(dir, "package.json");
        const meta = JSON.parse(readFileSync(candidate, "utf8"));
        if (meta.name === packageName) return candidate;
      } catch {
        // file doesn't exist or is invalid, continue up
      }
      dir = dirname(dir);
    }
    throw new Error(`Cannot find package.json for ${packageName}`);
  }
}

/**
 * Resolves the path to an executable in the ts-builder's node_modules/.bin directory
 * This ensures that ts-builder is self-contained and can work outside of monorepo
 */
export function resolveExecutable(executableName: string, packageName: string): string {
  const req = createRequire(join(rootDir, "package.json"));
  const pkgJsonPath = resolvePackageJson(req, packageName);
  const meta = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const binField = meta.bin;
  const rel =
    typeof binField === "string"
      ? binField
      : (binField?.[executableName] ?? Object.values(binField ?? {})[0]);

  if (!rel) throw new Error(`Cannot find "bin" for ${executableName}(${packageName})`);

  return join(dirname(pkgJsonPath), rel);
}

/**
 * Resolves the appropriate type checker executable based on target
 */
export function resolveTypeChecker(target: TargetType): string {
  const useVueTsc = target === "browser" || target === "browser-lib" || target === "block-ui";
  const commandName = useVueTsc ? "vue-tsc" : "tsc";
  const packageName = useVueTsc ? "vue-tsc" : "typescript";
  return resolveExecutable(commandName, packageName);
}

/**
 * Resolves vite executable
 */
export function resolveVite(): string {
  return resolveExecutable("vite", "vite");
}

/**
 * Resolves rolldown executable
 */
export function resolveRolldown(): string {
  return resolveExecutable("rolldown", "rolldown");
}

/**
 * Resolves oxlint executable
 */
export function resolveOxlint(): string {
  return resolveExecutable("oxlint", "oxlint");
}

/**
 * Resolves oxfmt executable
 */
export function resolveOxfmt(): string {
  return resolveExecutable("oxfmt", "oxfmt");
}
