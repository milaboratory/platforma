import { describe, expect, test } from "vitest";
import type { MachineMemory } from "./events";
import { createMachineMemoryReader } from "./machine_memory";

describe("machine memory sampling", () => {
  test("a platform that cannot take the reading says so once", () => {
    const read = (): MachineMemory => {
      throw new Error("must not be attempted where there is no source");
    };
    const next = createMachineMemoryReader({
      intervalMs: 1000,
      read,
      unsupportedReason: () => "no machine-wide memory source on win32: ...",
    });

    // Windows is most of the installed base, and a thirty-five second session
    // once carried thirty-four copies of this line between the samples that
    // hold the memory curve.
    expect(next(0)?.unavailable).toContain("win32");
    for (let now = 1; now <= 5000; now += 250) expect(next(now)).toBeUndefined();
  });

  test("a source that fails is stated once and kept on", () => {
    let outcome: MachineMemory = { unavailable: "vm_stat timed out" };
    const next = createMachineMemoryReader({
      intervalMs: 1000,
      read: () => outcome,
      unsupportedReason: () => undefined,
    });

    expect(next(0)?.unavailable).toBe("vm_stat timed out");
    // Stated, not repeated: the same failure every second would bury the curve.
    expect(next(1000)).toBeUndefined();
    expect(next(2000)).toBeUndefined();

    // A reading that fails under memory pressure is the one worth having a
    // moment later, so the source is still being asked.
    outcome = { swapUsed: 7 };
    expect(next(3000)).toEqual({ swapUsed: 7 });

    // And a failure after a recovery is news again.
    outcome = { unavailable: "vm_stat timed out" };
    expect(next(4000)?.unavailable).toBe("vm_stat timed out");
  });

  test("the reading is taken on its own interval, not with every sample", () => {
    let calls = 0;
    const next = createMachineMemoryReader({
      intervalMs: 1000,
      read: () => {
        calls++;
        return { swapUsed: calls };
      },
      unsupportedReason: () => undefined,
    });

    next(0);
    for (let now = 250; now < 1000; now += 250) expect(next(now)).toBeUndefined();
    expect(next(1000)).toEqual({ swapUsed: 2 });
    expect(calls).toBe(2);
  });

  test("a different failure is worth a record of its own", () => {
    const outcomes = ["vm_stat timed out", "sysctl: no such file", "sysctl: no such file"];
    let tick = 0;
    const next = createMachineMemoryReader({
      intervalMs: 1000,
      read: () => ({ unavailable: outcomes[tick++] }),
      unsupportedReason: () => undefined,
    });

    // Suppression is per reason, not a blanket silence: a source failing a new
    // way is evidence the previous record does not carry.
    expect(next(0)?.unavailable).toBe("vm_stat timed out");
    expect(next(1000)?.unavailable).toBe("sysctl: no such file");
    expect(next(2000)).toBeUndefined();
  });
});
