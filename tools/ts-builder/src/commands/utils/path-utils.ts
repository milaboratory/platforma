import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function getCurrentDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  return dirname(__filename);
}

function findPackageRoot(): string {
  let dir = getCurrentDir();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error("Could not find ts-builder package root");
}

export function getConfigsDir(): string {
  return join(findPackageRoot(), "dist", "configs");
}

export function getConfigPath(filename: string): string {
  return join(getConfigsDir(), filename);
}
