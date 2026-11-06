import { getTestAdminClient, getTestAdminClientConf } from "../test/test_config";
import { PlClient } from "./client";
import { PlDriver, PlDriverDefinition } from "./driver";
import { setTimeout as sleep } from "node:timers/promises";
import { Dispatcher, request } from "undici";
import { GrpcClientProviderFactory } from "./grpc";
import { test, expect } from "vitest";
import * as TestHelpers from "../test/test_config";
import { field } from "./transaction";

test("test client init", async () => {
  await getTestAdminClient(undefined);
});

test("test client alternative root init", async () => {
  const aRootName = "test_root";
  const { conf, auth } = await getTestAdminClientConf();
  await PlClient.init({ ...conf, alternativeRoot: aRootName }, auth);
  const clientB = await PlClient.init(conf, auth);
  const result = await clientB.deleteAlternativeRoot(aRootName);
  expect(result).toBe(true);
});

test("test client init 2", async () => {
  await getTestAdminClient();
});

interface SimpleDriver extends PlDriver {
  ping(): Promise<string>;
}

// The ping goes to a public URL. On CI, DNS, connect or the response can stop for some seconds.
// The dispatcher timeouts (10-30 s) are longer than the test timeout. Thus each attempt has
// a short deadline, and the sum of all attempts is less than the test timeout.
const PING_ATTEMPTS = 3;
const PING_ATTEMPT_TIMEOUT_MS = 2_000;
const PING_RETRY_DELAY_MS = 250;
// Time for the client init before the ping.
const CLIENT_INIT_MARGIN_MS = 5_000;
const PING_TEST_TIMEOUT_MS =
  PING_ATTEMPTS * PING_ATTEMPT_TIMEOUT_MS +
  (PING_ATTEMPTS - 1) * PING_RETRY_DELAY_MS +
  CLIENT_INIT_MARGIN_MS;

const SimpleDriverDefinition: PlDriverDefinition<SimpleDriver> = {
  name: "SimpleDriver",
  init(
    pl: PlClient,
    grpcClientProviderFactory: GrpcClientProviderFactory,
    httpDispatcher: Dispatcher,
  ): SimpleDriver {
    return {
      async ping(): Promise<string> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= PING_ATTEMPTS; attempt++) {
          try {
            // The signal also stops the body read.
            const response = await request("https://cdn.milaboratory.com/ping", {
              dispatcher: httpDispatcher,
              signal: AbortSignal.timeout(PING_ATTEMPT_TIMEOUT_MS),
            });
            return await response.body.text();
          } catch (err) {
            lastError = err;
            if (attempt < PING_ATTEMPTS) await sleep(PING_RETRY_DELAY_MS);
          }
        }
        throw lastError;
      },
      close() {},
    };
  },
};

test(
  "test driver",
  async () => {
    const client = await getTestAdminClient();
    const drv = client.getDriver(SimpleDriverDefinition);
    expect(await drv.ping()).toEqual("pong");
  },
  PING_TEST_TIMEOUT_MS,
);

test("the transaction resource cache reuses a JSON value but refetches a tree-final StreamManager", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const { manager, value } = await pl.withWriteTx("CacheSeed", async (tx) => {
      // unique content: Values are deduplicated by content
      const v = tx.createValue(
        { name: "json/object", version: "1" },
        Buffer.from(JSON.stringify({ nonce: `${Date.now()}-${Math.random()}` })),
      );
      // stream === downloadable, so the tree calls it final
      const m = tx.createStruct({ name: "StreamManager", version: "1" });
      for (const name of ["stream", "downloadable"]) {
        tx.createField(field(m, name), "Input");
        tx.setField(field(m, name), v);
      }
      tx.lock(m);
      const f = field(tx.clientRoot, "cachedManager");
      tx.createField(f, "Dynamic");
      tx.setField(f, m);
      await tx.commit();
      return { manager: await m.globalId, value: await v.globalId };
    });

    const cacheHitsOnSecondRead = async (rid: typeof manager) => {
      await pl.withReadTx("First", async (tx) => await tx.getResourceData(rid, true));
      return await pl.withReadTx("Second", async (tx) => {
        const data = await tx.getResourceData(rid, true);
        expect(pl.finalPredicate(data)).toBe(true);
        return tx.stat.rGetDataCacheHits;
      });
    };
    expect(await cacheHitsOnSecondRead(value)).toBe(1);
    // its `stream` is reset after an error, so the cache must not keep its fields
    expect(await cacheHitsOnSecondRead(manager)).toBe(0);
  });
});
