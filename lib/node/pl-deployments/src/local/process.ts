import type { SpawnOptions, ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { sleep } from "@milaboratories/ts-helpers";

export type ProcessOptions = {
  cmd: string;
  args: string[];
  opts: SpawnOptions;
};

export function processRun(logger: MiLogger, opts: ProcessOptions): ChildProcess {
  logger.info(`Running:
cmd: ${JSON.stringify([opts.cmd, ...opts.args])}
wd: ${opts.opts.cwd}`);

  logger.info("  spawning child process");
  return spawn(opts.cmd, opts.args, opts.opts);
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);

    // Check we look at 'platforma' to not kill wrong process.
    const processName = getProcessName(pid);
    if (process.platform === "win32") {
      return processName === "platforma.exe"; // process name does not contain path to the file.
    }

    // Linux and Mac OS X behave differently (so can different Linux distributions).
    // Process name can contain original path to the binary file or just its name.
    return processName.endsWith("/platforma") || processName === "platforma";
  } catch {
    return false;
  }
}

function getProcessName(pid: number): string {
  try {
    if (process.platform === "win32") {
      // Windows: use tasklist command
      const output = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8" });
      const lines = output.trim().split("\n");
      if (lines.length > 0 && lines[0].includes(",")) {
        const parts = lines[0].split(",");
        if (parts.length >= 1) {
          // Remove quotes and get the executable name
          const exeName = parts[0].replace(/^"|"$/g, "").trim();
          return exeName;
        }
      }
    } else {
      // Unix-like systems: use ps command
      const output = execSync(`ps -p ${pid} -o comm=`, { encoding: "utf8" });
      const processName = output.trim();
      return processName;
    }
  } catch {
    // If we can't get the process name, return empty string
    return "";
  }
  return "";
}

/**
 * Signals the process to stop. Returns false if it had already exited: a backend that crashed is
 * as stopped as one we stop, and throwing ESRCH here left callers unable to reconnect.
 */
export function processStop(pid: number, force: boolean = false): boolean {
  try {
    return process.kill(pid, force ? "SIGKILL" : "SIGINT");
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && e.code === "ESRCH") return false;
    throw e;
  }
}

export async function processWaitStopped(pid: number, maxMs: number) {
  const sleepMs = 100;
  let total = 0;
  while (await isProcessAlive(pid)) {
    await sleep(sleepMs);
    total += sleepMs;
    if (total > maxMs) {
      throw new Error(`The process did not stopped after ${maxMs} ms.`);
    }
  }
}
