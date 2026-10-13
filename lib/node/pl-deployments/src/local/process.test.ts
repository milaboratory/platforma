import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, test } from "vitest";
import { processStop } from "./process";

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

test("processStop signals a running process", async () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60_000)"]);
  const exited = once(child, "exit");

  expect(processStop(child.pid!)).toBe(true);
  await exited;
});
