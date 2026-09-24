import { getTestAdminClient, getTestAdminClientConf } from "../test/test_config";
import { PlClient } from "./client";
import { PlDriver, PlDriverDefinition } from "./driver";
import { Dispatcher, request } from "undici";
import type { WireClientProviderFactory } from "./wire";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, test, expect } from "vitest";

const pingServer = createServer((req, res) => {
  if (req.url === "/ping") {
    res.end("pong");
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});
let pingUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => pingServer.listen(0, "127.0.0.1", resolve));
  const { port } = pingServer.address() as AddressInfo;
  pingUrl = `http://127.0.0.1:${port}/ping`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    pingServer.close((err) => (err ? reject(err) : resolve())),
  );
});

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
    wireClientFactory: WireClientProviderFactory,
    httpDispatcher: Dispatcher,
  ): SimpleDriver {
    return {
      async ping(): Promise<string> {
        const response = await request(pingUrl, {
          dispatcher: httpDispatcher,
        });
        return await response.body.text();
      },
      close() {},
    };
  },
};

test("test driver", async ({ skip }) => {
  const client = await getTestAdminClient();
  const drv = client.getDriver(SimpleDriverDefinition);
  try {
    skip(client.conf.httpProxy !== undefined, "a proxy cannot reach the local ping server");
    expect(await drv.ping()).toEqual("pong");
  } finally {
    await client.close();
  }
});
