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

export interface SidecarLifecycle {
  /** Write the sidecar and mark it as live for cleanup. */
  publish(payload: DevServerSidecar): void;
  /** Remove the sidecar explicitly (idempotent). */
  remove(): void;
}

/**
 * Set up lifecycle hooks for a sidecar file BEFORE the server that owns it
 * is started.
 *
 * Registration order matters. Node fires same-signal handlers in registration
 * order. Vite's `createServer` / `listen` registers its own SIGINT/SIGHUP/etc.
 * handlers that exit the process — if we wait until after `createServer` to
 * register ours, Vite's may run first, exit synchronously, and our cleanup
 * is missed. Install everything up-front, then `publish()` once the URL is
 * known. `remove()` and the signal-triggered cleanup are idempotent.
 */
export function setupSidecarLifecycle(sidecarPath: string): SidecarLifecycle {
  let live = false;

  const cleanup = () => {
    if (!live) return;
    live = false;
    removeSidecar(sidecarPath);
  };

  const exitOn = (signal: NodeJS.Signals) => {
    process.on(signal, () => {
      cleanup();
      // Re-raise the default behavior with a clean exit code so callers
      // (shell, pnpm) see the expected termination.
      process.exit(0);
    });
  };

  exitOn("SIGINT");
  exitOn("SIGTERM");
  exitOn("SIGHUP");
  process.on("exit", cleanup);
  process.on("uncaughtException", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });

  return {
    publish(payload) {
      writeSidecar(sidecarPath, payload);
      live = true;
    },
    remove: cleanup,
  };
}
