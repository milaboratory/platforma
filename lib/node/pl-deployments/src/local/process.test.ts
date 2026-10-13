import { spawn } from "node:child_process";
import { once } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
import { processStop } from "./process";

afterEach(() => {
  vi.restoreAllMocks();
});

async function exitedPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""]);
  await once(child, "exit");
  return child.pid!;
}

test("processStop returns false for a process that has already exited", async () => {
  const pid = await exitedPid();

  expect(processStop(pid)).toBe(false);
  expect(processStop(pid, true)).toBe(false);
});

test("processStop rethrows errors other than ESRCH", () => {
  // Mocked: a real EPERM needs a process we may not signal, and under root that signal lands.
  const eperm = Object.assign(new Error("kill EPERM"), { code: "EPERM" });
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw eperm;
  });

  expect(() => processStop(12345)).toThrow(eperm);
});

test("processStop signals a running process", async () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60_000)"]);
  const exited = once(child, "exit");
  try {
    expect(processStop(child.pid!)).toBe(true);
    await exited;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  }
});
