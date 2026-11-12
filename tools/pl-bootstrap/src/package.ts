import { resolve } from "node:path";
import * as fs from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function path(...p: string[]): string {
  return resolve(__dirname, "..", ...p);
}

export function dist(...p: string[]): string {
  return path("dist", ...p);
}

export function assets(...p: string[]): string {
  return path("assets", ...p);
}

export function composeFiles(): string[] {
  const dockerDirEntries = fs.readdirSync(assets());
  return dockerDirEntries
    .filter((entry) => {
      return entry.startsWith("compose-") && entry.endsWith(".yaml");
    })
    .map((value) => assets(value));
}

export function readFileSync(...p: string[]): Buffer {
  return fs.readFileSync(path(...p));
}

/** The backend version `pl-dev` downloads and runs unless a version is given: `pl-version` in package.json. */
export function getDefaultPlVersion(): string {
  const packageJson = z
    .object({ "pl-version": z.string() })
    .parse(JSON.parse(readFileSync("package.json").toString()));
  return packageJson["pl-version"];
}

export function plImageTag(version?: string): string {
  if (!version) {
    version = getDefaultPlVersion();
  }

  return `quay.io/milaboratories/platforma:${version}`;
}
