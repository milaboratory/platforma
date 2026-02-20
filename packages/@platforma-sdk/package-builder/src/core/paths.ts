import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function path(...p: string[]): string {
  return resolve(__dirname, "..", "..", ...p);
}

export function assets(...p: string[]): string {
  return path("assets", ...p);
}

export function dist(...p: string[]): string {
  return path("dist", ...p);
}
