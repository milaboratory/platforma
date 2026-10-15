import type { Computable } from "@milaboratories/computable";
import { isTimeoutOrCancelError } from "@milaboratories/pl-client";
import { TestHelpers } from "@milaboratories/pl-middle-layer";
import { randomUUID } from "node:crypto";
import type { BigIntStats } from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";

/** A fresh scratch folder under `work/` in the current directory. */
export async function createWorkFolder(): Promise<string> {
  const workFolder = path.resolve(`work/${randomUUID()}`);
  await fsp.mkdir(workFolder, { recursive: true });
  return workFolder;
}

export async function removeWorkFolder(workFolder: string): Promise<void> {
  await fsp.rm(workFolder, { recursive: true, maxRetries: 3, retryDelay: 100 });
}

/** A fresh alternative-root name, so a test client sees a backend of its own. */
export const newAlternativeRoot = () => `test_${Date.now()}_${randomUUID()}`;

/** Delete an alternative root through a short-lived client of the main root. */
export async function deleteAlternativeRoot(alternativeRoot: string): Promise<void> {
  const client = await TestHelpers.getTestClient();
  try {
    await client.deleteAlternativeRoot(alternativeRoot);
  } finally {
    // Close the cleanup client to avoid dangling gRPC channels
    // that can cause segfaults during process exit
    await client.close();
  }
}

export async function tryStat(path: string): Promise<BigIntStats | undefined> {
  try {
    return await fsp.stat(path, { bigint: true });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function awaitStableState<S>(
  computable: Computable<unknown, S>,
  timeout: number | AbortSignal = 5000,
): Promise<S> {
  try {
    return await computable.awaitStableValue(
      typeof timeout === "number" ? AbortSignal.timeout(timeout) : timeout,
    );
  } catch (e: unknown) {
    if (isTimeoutOrCancelError(e)) {
      const fullValue = await computable.getFullValue();
      console.dir(fullValue, { depth: 5 });
      throw new Error(
        `Aborted while awaiting stable value. Unstable marker: ${fullValue.unstableMarker}`,
        { cause: e },
      );
    } else throw e;
  }
}

/** Resolve after `ms`, or as soon as `signal` aborts. */
export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
