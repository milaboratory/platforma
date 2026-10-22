import net from "node:net";
import path from "path";
import { randomUUID } from "node:crypto";
import { TestHelpers } from "@milaboratories/pl-client";
import { test } from "vitest";
import { MiddleLayer } from "./middle_layer";

// Local-only: times MiddleLayer.init against a local PL_ADDRESS through a proxy that delays every
// chunk by PL_PROXY_LATENCY_MS each way (default 25, ~50ms RTT). Run with PL_ML_INIT_BENCH=1.
test.runIf(process.env.PL_ML_INIT_BENCH)(
  "MiddleLayer.init latency",
  { timeout: 300_000 },
  async () => {
    const latency = Number(process.env.PL_PROXY_LATENCY_MS ?? 25);
    const target = new URL(process.env.PL_ADDRESS!);
    const proxy = await startLinkProxy(Number(target.port), latency);
    process.env.PL_ADDRESS = `http://127.0.0.1:${proxy.port}`;
    const totals: number[] = [];
    try {
      await TestHelpers.withTempRoot(async (pl) => {
        const rtts: number[] = [];
        for (let i = 0; i < 5; i++) {
          const t = performance.now();
          await pl.ping();
          rtts.push(performance.now() - t);
        }
        console.log(`ping rtt ms: ${rtts.map((r) => r.toFixed(0)).join(" ")}`);

        // Run 0 on the fresh temp root is a first-time user; the rest run on the test user's own
        // root, which keeps its singletons between runs, as a returning user's does.
        for (let run = 0; run < 5; run++) {
          // The ML closes its client, so each run after the first opens its own.
          const client = run === 0 ? pl : await TestHelpers.getTestClient();
          const t0 = performance.now();
          const stamp = (msg: unknown) =>
            console.log(`  +${(performance.now() - t0).toFixed(0).padStart(5)}ms ${String(msg)}`);
          const ml = await MiddleLayer.init(client, path.resolve(`work/${randomUUID()}`), {
            localSecret: MiddleLayer.generateLocalSecret(),
            localProjections: [],
            openFileDialogCallback: () => {
              throw new Error("Not implemented.");
            },
            logger: { info: stamp, warn: stamp, error: stamp },
          });
          totals.push(performance.now() - t0);
          stamp(`run ${run}: init done`);
          await ml.close();
        }
      });
    } finally {
      process.env.PL_ADDRESS = target.toString();
      proxy.close();
    }
    console.log(`init ms per run: ${totals.map((t) => t.toFixed(0)).join(" ")}`);
  },
);

/** A TCP proxy behaving like a link with a fixed one-way delay: every chunk is forwarded `latency`
 *  ms after it arrives, so back-to-back chunks overlap instead of queueing behind each other. */
async function startLinkProxy(targetPort: number, latency: number) {
  const delayed = (from: net.Socket, to: net.Socket) => {
    from.on("data", (chunk) => setTimeout(() => to.write(chunk), latency));
    from.on("end", () => setTimeout(() => to.end(), latency));
    from.on("error", () => to.destroy());
  };
  const server = net.createServer((socket) => {
    const upstream = net.connect(targetPort, "127.0.0.1");
    delayed(socket, upstream);
    delayed(upstream, socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return { port, close: () => server.close() };
}
