import * as fs from "node:fs";
import * as path from "node:path";

export interface DevServerSidecar {
  schema: 1;
  url: string;
  pid: number;
}

/**
 * Atomically write the sidecar JSON file. The desktop app polls this file
 * when loading a dev-v2 block; an atomic rename avoids the consumer reading
 * a half-written file.
 */
export function writeSidecar(sidecarPath: string, payload: DevServerSidecar): void {
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  const tmp = sidecarPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, sidecarPath);
}

export function removeSidecar(sidecarPath: string): void {
  try {
    fs.unlinkSync(sidecarPath);
  } catch {
    // ignore — already gone
  }
}

/**
 * Install best-effort cleanup hooks. SIGINT/SIGTERM trigger an explicit
 * unlink and then a clean process exit so any downstream `process.on("exit")`
 * handlers also run.
 */
export function installSidecarCleanup(sidecarPath: string): void {
  const cleanup = () => removeSidecar(sidecarPath);
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}
