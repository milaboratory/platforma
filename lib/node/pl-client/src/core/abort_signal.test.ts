import { getEventListeners } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { withTempRoot } from "../test/test_config";
import { withCallAbortSignal } from "./abort_signal";
import type { PlClient, TxOps } from "./client";
import { isAbortedError } from "./errors";

const TRANSACTIONS = 2000;
const WARM_UP_TRANSACTIONS = 200;
const CONCURRENT_TRANSACTIONS = 20;
const MAX_HEAP_BYTES_PER_TRANSACTION = 5000;
const HELPER_CALLS = 100;

setFlagsFromString("--expose-gc");
const collectGarbage: () => void = runInNewContext("gc");

async function settledMemory(): Promise<NodeJS.MemoryUsage> {
  for (let round = 0; round < 5; round++) {
    collectGarbage();
    await sleep(20);
  }
  return process.memoryUsage();
}

async function runTransactions(pl: PlClient, count: number, ops: Partial<TxOps>): Promise<void> {
  for (let done = 0; done < count; done += CONCURRENT_TRANSACTIONS) {
    await Promise.all(
      Array.from({ length: CONCURRENT_TRANSACTIONS }, () =>
        pl.withReadTx("leakProbe", (tx) => tx.getResourceData(pl.clientRoot, false), ops),
      ),
    );
  }
}

test("withCallAbortSignal aborts the call's signal with the caller's reason", async () => {
  const source = new AbortController();
  const reason = new Error("stop");

  const call = withCallAbortSignal(
    source.signal,
    (abort) =>
      new Promise<never>((_resolve, reject) => {
        abort.addEventListener("abort", () => reject(abort.reason));
      }),
  );
  source.abort(reason);

  await expect(call).rejects.toBe(reason);
});

test("withCallAbortSignal leaves no listener after a call that ends", async () => {
  const source = new AbortController();

  await expect(withCallAbortSignal(source.signal, async () => "done")).resolves.toBe("done");

  expect(getEventListeners(source.signal, "abort")).toHaveLength(0);
});

test("withCallAbortSignal runs a call without a signal", async () => {
  const call = vi.fn(async (abort: AbortSignal) => abort.aborted);

  await expect(withCallAbortSignal(undefined, call)).resolves.toBe(false);
});

test("withCallAbortSignal does not start a call for an aborted signal", async () => {
  const reason = new Error("stop");
  const call = vi.fn(async () => "done");

  await expect(withCallAbortSignal(AbortSignal.abort(reason), call)).rejects.toBe(reason);

  expect(call).not.toHaveBeenCalled();
});

test("withCallAbortSignal keeps no call in memory after it ends", async () => {
  const longLived = new AbortController();
  const callStates: WeakRef<object>[] = [];

  for (let index = 0; index < HELPER_CALLS; index++) {
    await withCallAbortSignal(longLived.signal, async (abort) => {
      const callState = {};
      callStates.push(new WeakRef(callState));
      abort.addEventListener("abort", () => callState);
    });
  }
  await settledMemory();

  const alive = callStates.filter((callState) => callState.deref() !== undefined);
  expect(alive.length).toBeLessThan(HELPER_CALLS / 10);
});

test("an abort of the caller's signal ends a running transaction", async () => {
  await withTempRoot(async (pl) => {
    const caller = new AbortController();

    const transaction = pl.withReadTx(
      "aborted",
      async (tx) => {
        await tx.getResourceData(pl.clientRoot, false);
        caller.abort();
        await tx.getResourceData(pl.clientRoot, false);
      },
      { abortSignal: caller.signal },
    );

    await expect(transaction).rejects.toSatisfy(isAbortedError);
  });
});

test("a transaction does not start for an aborted signal", async () => {
  await withTempRoot(async (pl) => {
    const reason = new Error("stop");
    const body = vi.fn(async () => "done");

    const transaction = pl.withReadTx("aborted", body, { abortSignal: AbortSignal.abort(reason) });

    await expect(transaction).rejects.toBe(reason);
    expect(body).not.toHaveBeenCalled();
  });
});

test("transactions with a long-lived abort signal leave nothing in memory", async () => {
  await withTempRoot(async (pl) => {
    const longLived = new AbortController();
    const ops = { abortSignal: longLived.signal };

    await runTransactions(pl, WARM_UP_TRANSACTIONS, ops);
    const before = await settledMemory();
    await runTransactions(pl, TRANSACTIONS, ops);
    const after = await settledMemory();

    expect(getEventListeners(longLived.signal, "abort")).toHaveLength(0);
    expect((after.heapUsed - before.heapUsed) / TRANSACTIONS).toBeLessThan(
      MAX_HEAP_BYTES_PER_TRANSACTION,
    );
  });
}, 60_000);
