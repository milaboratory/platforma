import net from "node:net";
import path from "path";
import { randomUUID } from "node:crypto";
import type { PlClient } from "@milaboratories/pl-client";
import { plAddressToConfig, TestHelpers } from "@milaboratories/pl-client";
import { test } from "vitest";
import { MiddleLayer } from "./middle_layer";

// Times MiddleLayer.init against a local http backend through a proxy that delays every chunk by
// PL_PROXY_LATENCY_MS each way (default 25). No-ops without PL_ML_INIT_BENCH=1:
//   PL_ML_INIT_BENCH=1 PL_PROXY_LATENCY_MS=50 pnpm vitest run src/middle_layer/init_latency_benchmark.test.ts
test.skipIf(process.env.PL_ML_INIT_BENCH !== "1")(
  "MiddleLayer.init latency",
  { timeout: 300_000 },
  async () => {
    const { hostAndPort, ssl } = plAddressToConfig(TestHelpers.getTestConfig().address);
    const [host, port] = hostAndPort.split(":");
    if (ssl || (host !== "127.0.0.1" && host !== "localhost")) {
      console.warn("*** skipping benchmark, PL_ADDRESS is not a local http backend", hostAndPort);
      return;
    }
    const proxy = await startLinkProxy(
      host,
      Number(port),
      Number(process.env.PL_PROXY_LATENCY_MS ?? 25),
    );
    // Only the dialed address changes; everything else PL_ADDRESS sets (timeouts, auth) still applies.
    const viaProxy = { hostAndPort: `127.0.0.1:${proxy.port}` };
    const tempRoot = `test_${Date.now()}_${randomUUID()}`;
    const totals: number[] = [];
    try {
      // Run 0 is a first-time user on a fresh temp root. The rest run on the test user's own root,
      // whose singletons persist like a returning user's (run 1 too may create them on a fresh
      // backend), and they load whatever other tests left there, so they vary between machines.
      for (let run = 0; run < 5; run++) {
        const client = await TestHelpers.getTestClient(run === 0 ? tempRoot : undefined, viaProxy);
        if (run === 0) await logPingRtt(client);
        const t0 = performance.now();
        const stamp = (msg: unknown) =>
          console.log(`  +${(performance.now() - t0).toFixed(0).padStart(5)}ms ${String(msg)}`);
        let ml: MiddleLayer;
        try {
          ml = await MiddleLayer.init(client, path.resolve(`work/${randomUUID()}`), {
            localSecret: MiddleLayer.generateLocalSecret(),
            localProjections: [],
            openFileDialogCallback: () => {
              throw new Error("Not implemented.");
            },
            logger: { info: stamp, warn: stamp, error: stamp },
          });
        } catch (e) {
          await client.close();
          throw e;
        }
        try {
          totals.push(performance.now() - t0);
          stamp(`run ${run}: init done`);
        } finally {
          // Closes the client too.
          await ml.close();
        }
      }
    } finally {
      proxy.close();
      const owner = await TestHelpers.getTestClient();
      try {
        await owner.deleteAlternativeRoot(tempRoot);
      } finally {
        await owner.close();
      }
    }
    console.log(`init ms per run: ${totals.map((t) => t.toFixed(0)).join(" ")}`);
  },
);

async function logPingRtt(pl: PlClient) {
  const rtts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await pl.ping();
    rtts.push(performance.now() - t);
  }
  console.log(`ping rtt ms: ${rtts.map((r) => r.toFixed(0)).join(" ")}`);
}

/** A TCP proxy behaving like a link with a fixed one-way delay: every chunk is forwarded `latency`
 *  ms after it arrives, so back-to-back chunks overlap instead of queueing behind each other. */
async function startLinkProxy(targetHost: string, targetPort: number, latency: number) {
  const delayed = (from: net.Socket, to: net.Socket) => {
    from.on("data", (chunk) => setTimeout(() => to.write(chunk), latency));
    from.on("end", () => setTimeout(() => to.end(), latency));
    from.on("error", () => to.destroy());
  };
  const server = net.createServer((socket) => {
    const upstream = net.connect(targetPort, targetHost);
    delayed(socket, upstream);
    delayed(upstream, socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return { port, close: () => server.close() };
}
