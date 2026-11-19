import { existsSync } from "node:fs";

/**
 * The tsconfig describing a package's production sources: `tsconfig.build.json` when the package
 * has one, else `tsconfig.json`. A package keeps `tsconfig.json` for editors and language
 * servers, which discover only that name, and lets it cover tests too; declaration output and
 * the production type check then read `tsconfig.build.json`, so test files never reach `dist`.
 */
export function buildTsconfig(dir: string = process.cwd()): string {
  return existsSync(`${dir}/tsconfig.build.json`) ? "tsconfig.build.json" : "tsconfig.json";
}
