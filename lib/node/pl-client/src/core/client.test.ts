import { getTestAdminClient, getTestAdminClientConf } from "../test/test_config";
import { PlClient } from "./client";
import { PlDriver, PlDriverDefinition } from "./driver";
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

const SimpleDriverDefinition: PlDriverDefinition<SimpleDriver> = {
  name: "SimpleDriver",
  init(
    pl: PlClient,
    grpcClientProviderFactory: GrpcClientProviderFactory,
    httpDispatcher: Dispatcher,
  ): SimpleDriver {
    return {
      async ping(): Promise<string> {
        const response = await request("https://cdn.milaboratory.com/ping", {
          dispatcher: httpDispatcher,
        });
        return await response.body.text();
      },
      close() {},
    };
  },
};

test("test driver", async () => {
  const client = await getTestAdminClient();
  const drv = client.getDriver(SimpleDriverDefinition);
  expect(await drv.ping()).toEqual("pong");
});

test("the transaction resource cache keeps tree-final data, except a StreamManager", async () => {
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
