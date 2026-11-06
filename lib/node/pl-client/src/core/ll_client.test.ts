import { LLPlClient } from "./ll_client";
import {
  getTestConfig,
  plAddressToTestConfig,
  getTestLLClient,
  getTestAdminLLClient,
  getTestAdminClient,
  getTestClientConf,
} from "../test/test_config";
import {
  AuthAPI_ListUserResources_Response,
  TxAPI_Open_Request_WritableTx,
} from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import { request } from "undici";
import * as tp from "node:timers/promises";
import { test, expect, vi } from "vitest";
import type { PlConnectionStatus } from "./config";
import { startTcpProxy } from "../test/tcp-proxy";

import { isUnimplementedError, UnauthenticatedError } from "./errors";

function restRespond(client: LLPlClient, status: number) {
  return client["createRestErrorMiddleware"]().onResponse?.({
    request: new Request("http://127.0.0.1/v1/ping"),
    response: new Response(status === 503 ? "unavailable" : "{}", { status }),
    schemaPath: "/v1/ping",
    params: {},
    id: "test",
    options: {
      baseUrl: "http://127.0.0.1",
      parseAs: "json",
      querySerializer: () => "",
      bodySerializer: (body) => JSON.stringify(body),
      fetch: globalThis.fetch,
    },
  });
}

test("wire protocol detection", async () => {
  const { conf, auth } = await getTestClientConf();
  const expectedWireProtocol = conf.wireProtocol ?? "grpc";
  conf.wireProtocol = undefined;

  const client = await LLPlClient.build(conf, { auth });
  expect(client.wireProtocol).toBe(expectedWireProtocol);
});

test("authenticated instance test", async () => {
  const client = await getTestLLClient();
  const tx = client.createTx(true);
  const response = await tx.send(
    {
      oneofKind: "txOpen",
      txOpen: {
        name: "test",
        writable: TxAPI_Open_Request_WritableTx.WRITABLE,
        enableFormattedErrors: false,
      },
    },
    false,
  );
  expect(response.txOpen.tx?.isValid).toBeTruthy();
  await tx.complete();
  await tx.await();
});

test("unauthenticated status change", async () => {
  const cfg = getTestConfig();
  if (cfg.test_password === undefined) {
    console.log("skipping test because target server doesn't support authentication");
    return;
  }

  // The flip to Unauthenticated is async, so await it via the status listener.
  let onUnauthenticated!: () => void;
  const unauthenticated = new Promise<void>((resolve) => (onUnauthenticated = resolve));

  const client = await LLPlClient.build(plAddressToTestConfig(cfg.address), {
    statusListener: (s) => {
      if (s === "Unauthenticated") onUnauthenticated();
    },
  });
  expect(client.status).toBe("OK");

  const tx = client.createTx(true);

  await expect(async () => {
    await tx.send(
      {
        oneofKind: "txOpen",
        txOpen: {
          name: "test",
          writable: TxAPI_Open_Request_WritableTx.WRITABLE,
          enableFormattedErrors: false,
        },
      },
      false,
    );
  }).rejects.toThrow(UnauthenticatedError);

  await expect(async () => {
    await tx.await();
  }).rejects.toThrow(UnauthenticatedError);

  await Promise.race([
    unauthenticated,
    tp
      .setTimeout(5000)
      .then(() => Promise.reject(new Error("status never became Unauthenticated"))),
  ]);

  expect(client.status).toEqual("Unauthenticated");

  await client.ping();
  await restRespond(client, 503);
  await tp.setTimeout(10);
  expect(client.status).toEqual("Unauthenticated");
});

test("automatic token update", async () => {
  const cfg = getTestConfig();
  if (cfg.test_password === undefined) {
    console.log("skipping test because target server doesn't support authentication");
    return;
  }

  const { conf, auth } = await getTestClientConf();
  conf.authMaxRefreshSeconds = 1;
  let numberOfAuthUpdates = 0;
  const client = await LLPlClient.build(conf, {
    auth: {
      authInformation: auth.authInformation,
      onUpdate: (auth) => {
        console.log(auth);
        ++numberOfAuthUpdates;
      },
    },
  });

  for (let i = 0; i < 6; i++) {
    const tx = client.createTx(true);
    const response = await tx.send(
      {
        oneofKind: "txOpen",
        txOpen: {
          name: "test",
          writable: TxAPI_Open_Request_WritableTx.WRITABLE,
          enableFormattedErrors: false,
        },
      },
      false,
    );
    expect(response.txOpen.tx?.isValid).toBeTruthy();
    await tx.complete();
    await tx.await();

    if (numberOfAuthUpdates > 1) {
      return;
    }

    await tp.setTimeout(1000);
  }
}, 5000);

test("test simple https call", async () => {
  const client = await getTestLLClient();
  const response = await request("https://cdn.milaboratory.com/ping", {
    dispatcher: client.httpDispatcher,
  });
  const text = await response.body.text();
  expect(text).toEqual("pong");
});

test("test https call via proxy", async () => {
  const testConfig = getTestConfig();
  if (testConfig.test_proxy === undefined) {
    console.log("skipped");
    return;
  }
  const client = await getTestLLClient({ httpProxy: testConfig.test_proxy });
  const response = await request("https://cdn.milaboratory.com/ping", {
    dispatcher: client.httpDispatcher,
  });
  const text = await response.body.text();
  expect(text).toEqual("pong");
});

test("list user resources returns user root", async () => {
  // PlClient.init() creates the user root via the legacy path, which requires the admin
  // role. After that, listUserResources returns it.
  const plClient = await getTestAdminClient();
  await plClient.close();

  const client = await getTestAdminLLClient();

  let responses: AuthAPI_ListUserResources_Response[] = [];
  try {
    responses = await client.listUserResources({ limit: 1 });
  } catch (error) {
    if (isUnimplementedError(error)) {
      console.log("skipping test because backend doesn't support listUserResources");
      return;
    }
    throw error;
  }

  // First message is always the user root.
  expect(responses.length).toBeGreaterThanOrEqual(1);
  expect(responses[0].entry.oneofKind).toBe("userRoot");

  // If there are more resources, the last message is a continuation token.
  if (responses.length > 1) {
    const last = responses[responses.length - 1];
    expect(last.nextResourceId).not.toBe(0n);
  }
});

const testUrl = URL.parse(getTestConfig().address);
const isLocalHttp =
  testUrl?.protocol === "http:" && ["127.0.0.1", "localhost"].includes(testUrl.hostname);

test.skipIf(!isLocalHttp)(
  "gRPC status returns to OK after a connection loss",
  async () => {
    const targetPort = Number(testUrl?.port || 80);
    const { conf, auth } = await getTestClientConf();
    const proxy = await startTcpProxy({ targetPort, latency: 0 });
    const port = proxy.port;
    const statuses: PlConnectionStatus[] = [];
    const client = await LLPlClient.build(
      { ...conf, hostAndPort: `127.0.0.1:${port}`, wireProtocol: "grpc" },
      { auth, statusListener: (s) => statuses.push(s) },
    );
    let restarted: Awaited<ReturnType<typeof startTcpProxy>> | undefined;
    try {
      const closed = proxy.close();
      await proxy.disconnectAll();
      await closed;

      await expect(client.ping()).rejects.toThrow();
      await vi.waitFor(() => expect(client.status).toBe("Disconnected"));
      // Keep calls failing, so the reconnect backoff of the subchannel grows.
      for (let i = 0; i < 20; i++) {
        await expect(client.ping()).rejects.toThrow();
        await tp.setTimeout(300);
      }

      restarted = await startTcpProxy({ port, targetPort, latency: 0 });
      const startedAt = performance.now();
      const second = await LLPlClient.build(
        { ...conf, hostAndPort: `127.0.0.1:${port}`, wireProtocol: "grpc" },
        { auth },
      );
      expect(performance.now() - startedAt).toBeLessThan(3_000);
      await second.close();

      await vi.waitFor(() => client.ping(), { timeout: 20_000, interval: 500 });
      await vi.waitFor(() => expect(client.status).toBe("OK"));
      expect(statuses).toEqual(["OK", "Disconnected", "OK"]);
    } finally {
      await client.close();
      await restarted?.close();
    }
  },
  40_000,
);

test("REST status returns to OK on a 2xx or 3xx response", async () => {
  const { conf, auth } = await getTestClientConf();
  const statuses: PlConnectionStatus[] = [];
  const client = await LLPlClient.build(conf, {
    auth,
    statusListener: (s) => statuses.push(s),
  });
  const respond = (status: number) => restRespond(client, status);
  try {
    await respond(503);
    await vi.waitFor(() => expect(client.status).toBe("Disconnected"));
    await respond(503);
    await respond(404);
    await tp.setTimeout(10);
    expect(client.status).toBe("Disconnected");
    await respond(200);
    await vi.waitFor(() => expect(client.status).toBe("OK"));
    await respond(200);
    await tp.setTimeout(10);
    expect(statuses).toEqual(["OK", "Disconnected", "OK"]);
  } finally {
    await client.close();
  }
});

test.skipIf(getTestConfig().test_password === undefined)(
  "auth error fires for an expired session after a connection loss",
  async () => {
    let onAuthError!: () => void;
    const authError = new Promise<void>((resolve) => (onAuthError = resolve));
    const client = await LLPlClient.build(plAddressToTestConfig(getTestConfig().address), {
      auth: { authInformation: {}, onAuthError },
    });
    try {
      await restRespond(client, 503);
      await vi.waitFor(() => expect(client.status).toBe("Disconnected"));
      await expect(client.getSessionInfo()).rejects.toThrow();
      await Promise.race([
        authError,
        tp.setTimeout(5000).then(() => Promise.reject(new Error("onAuthError never fired"))),
      ]);
      expect(client.status).toBe("Unauthenticated");
    } finally {
      await client.close();
    }
  },
);
