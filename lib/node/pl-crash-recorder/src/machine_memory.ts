import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { MachineMemory } from "./events";

/**
 * Reads where the machine's memory currently is.
 *
 * Costs about two milliseconds on macOS and one file read on Linux, which is why
 * the sampler can afford it once a second. It never throws: a reading that cannot
 * be taken says so and the sampler carries on, because a missing number must not
 * cost the resident-size curve it accompanies.
 */
export function readMachineMemory(): MachineMemory {
  try {
    if (process.platform === "darwin") return readDarwin();
    if (process.platform === "linux") return readLinux();
    return { unavailable: machineMemoryUnsupported() };
  } catch (error: unknown) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Decides what each sampler tick should record about machine-wide memory.
 *
 * Three things are being balanced. The reading costs a subprocess, so it is
 * taken on its own interval rather than with every sample. Repeating an
 * unchanged failure every second buries the resident-size curve it sits beside,
 * so a reason is written once and not again while it still holds. And a failure
 * is not the end of the matter: a `vm_stat` that timed out did so under load,
 * which is precisely the moment its figures are worth having a second later —
 * so the source keeps being tried, and a reading that comes back is recorded.
 *
 * Only an unsupported platform stops it for good, because that is the one
 * condition a running process cannot get out of.
 */
export function createMachineMemoryReader(options: {
  intervalMs: number;
  read?: () => MachineMemory;
  unsupportedReason?: () => string | undefined;
}): (now: number) => MachineMemory | undefined {
  const read = options.read ?? readMachineMemory;
  const unsupported = (options.unsupportedReason ?? machineMemoryUnsupportedReason)();

  let pending = unsupported;
  let dueAt = 0;
  let statedFailure: string | undefined;

  return (now: number): MachineMemory | undefined => {
    if (pending !== undefined) {
      const reason = pending;
      pending = undefined;
      return { unavailable: reason };
    }
    if (unsupported !== undefined || now < dueAt) return undefined;

    dueAt = now + options.intervalMs;
    const reading = read();
    if (reading.unavailable === undefined) {
      // A recovery is worth seeing: the gap in the series ends where the
      // figures resume.
      statedFailure = undefined;
      return reading;
    }
    if (reading.unavailable === statedFailure) return undefined;
    statedFailure = reading.unavailable;
    return reading;
  };
}

/**
 * Names what the machine-wide reading would have contributed, for platforms
 * where it cannot be taken at all.
 *
 * A reader who finds no compressor or swap figures needs to know whether the
 * machine had none or the sampler never asked, and where the equivalent evidence
 * is instead. Callers record it once: it is a property of the platform and
 * repeating it every second buries the curve it was meant to explain.
 */
export function machineMemoryUnsupportedReason(): string | undefined {
  if (process.platform === "darwin" || process.platform === "linux") return undefined;
  return machineMemoryUnsupported();
}

// Internals

function readDarwin(): MachineMemory {
  const stat = execFileSync("vm_stat", { encoding: "utf8", timeout: 2000 });
  // The page size is stated in the header and is 16 KiB on Apple silicon against
  // 4 KiB elsewhere, so every count below is meaningless without reading it.
  const pageSize = Number(/page size of (\d+) bytes/.exec(stat)?.[1] ?? 4096);
  const pages = (label: string): number | undefined => {
    const match = new RegExp(`${label}:\\s+(\\d+)\\.`).exec(stat);
    return match ? Number(match[1]) * pageSize : undefined;
  };

  const swap = execFileSync("sysctl", ["-n", "vm.swapusage"], { encoding: "utf8", timeout: 2000 });
  const swapBytes = (label: string): number | undefined => {
    const match = new RegExp(`${label} = ([\\d.]+)M`).exec(swap);
    return match ? Number(match[1]) * 1024 * 1024 : undefined;
  };

  return {
    // "Stored" counts the memory before compression and is what went missing from
    // a process's resident set; "occupied" is what it costs the machine now.
    compressedStored: pages("Pages stored in compressor"),
    compressedOccupied: pages("Pages occupied by compressor"),
    swapUsed: swapBytes("used"),
    swapTotal: swapBytes("total"),
    anonymous: pages("Anonymous pages"),
    fileBacked: pages("File-backed pages"),
    wired: pages("Pages wired down"),
  };
}

function readLinux(): MachineMemory {
  const info = fs.readFileSync("/proc/meminfo", "utf8");
  const kb = (label: string): number | undefined => {
    const match = new RegExp(`^${label}:\\s+(\\d+) kB`, "m").exec(info);
    return match ? Number(match[1]) * 1024 : undefined;
  };
  const swapTotal = kb("SwapTotal");
  const swapFree = kb("SwapFree");
  return {
    swapTotal,
    swapUsed: swapTotal !== undefined && swapFree !== undefined ? swapTotal - swapFree : undefined,
    anonymous: kb("AnonPages"),
    fileBacked: kb("Cached"),
    // Linux has no compressor of its own; zram, where present, reports as swap.
    wired: kb("Unevictable"),
  };
}

function machineMemoryUnsupported(): string {
  return (
    `no machine-wide memory source on ${process.platform}: ` +
    "compressor, swap and anonymous/file-backed totals are not sampled " +
    "(vm_stat and sysctl are macOS-only, /proc/meminfo Linux-only). " +
    "Per-process committed bytes are recorded instead, as `private` in the host log."
  );
}
